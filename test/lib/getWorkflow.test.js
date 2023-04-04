'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const getWorkflow = require('../../lib/getWorkflow');
const REQUIRES_WORKFLOW = require('../data/requires-workflow.json');
const LEGACY_AND_REQUIRES_WORKFLOW = { ...REQUIRES_WORKFLOW };
const EXTERNAL_TRIGGER = require('../data/requires-workflow-exttrigger.json');
const EXPECTED_OUTPUT = require('../data/expected-output.json');
const NO_EDGES = { ...EXPECTED_OUTPUT };
const EXPECTED_EXTERNAL = require('../data/expected-external.json');
const EXPECTED_EXTERNAL_COMPLEX = require('../data/expected-external-complex.json');
const EXPECTED_EXTERNAL_JOIN = require('../data/expected-external-join.json');

NO_EDGES.edges = [];

describe('getWorkflow', () => {
    const triggerFactoryMock = {
        getDestFromSrc: sinon.stub().resolves([])
    };

    it('should throw if it is not given correct input', async () => {
        try {
            const pipelineConfig = { config: {} };

            await getWorkflow({ pipelineConfig, triggerFactory: triggerFactoryMock });
        } catch (e) {
            assert.equal(e.message, 'No Job config provided');
        }
    });

    it('should convert a config with job-requires workflow to directed graph', async () => {
        const requires = await getWorkflow({ pipelineConfig: REQUIRES_WORKFLOW, triggerFactory: triggerFactoryMock });
        const legacyRequires = await getWorkflow({
            pipelineConfig: LEGACY_AND_REQUIRES_WORKFLOW,
            triggerFactory: triggerFactoryMock
        });
        const external = await getWorkflow({ pipelineConfig: EXTERNAL_TRIGGER, triggerFactory: triggerFactoryMock });

        assert.deepEqual(requires, EXPECTED_OUTPUT);
        assert.deepEqual(legacyRequires, EXPECTED_OUTPUT);
        assert.deepEqual(external, EXPECTED_EXTERNAL);
    });

    it('should handle displayName', async () => {
        const pipelineConfig = {
            jobs: {
                foo: {
                    annotations: {
                        'screwdriver.cd/displayName': 'baz'
                    }
                },
                bar: {}
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock
        });

        assert.deepEqual(result, {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo', displayName: 'baz' }, { name: 'bar' }],
            edges: []
        });
    });

    it('should handle detached jobs', async () => {
        const pipelineConfig = {
            jobs: {
                foo: {},
                bar: { requires: ['foo'] }
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock
        });

        assert.deepEqual(result, {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo' }, { name: 'bar' }],
            edges: [{ src: 'foo', dest: 'bar' }]
        });
    });

    it('should handle stage requires', async () => {
        const pipelineConfig = {
            jobs: {
                foo: { requires: ['~commit'] },
                A: { requires: ['foo'] },
                B: { requires: ['foo', '~stage@other:teardown'] },
                C: { requires: ['~stage@deploy:setup'], stage: { name: 'deploy', startFrom: true } },
                D: { requires: ['~C'], stage: { name: 'deploy' } },
                main: { requires: ['~stage@other:setup'], stage: { name: 'other', startFrom: true } },
                publish: { requires: ['main'], stage: { name: 'other' } }
            },
            stages: {
                other: {
                    setup: {},
                    description: 'For canary deployment',
                    jobs: ['main', 'publish'],
                    startFrom: 'main'
                },
                deploy: {
                    requires: ['A'],
                    jobs: ['C', 'D']
                }
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock,
            pipelineOnly: false
        });

        assert.deepEqual(result.workflow, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'foo' },
                { name: 'A' },
                { name: 'B' },
                { name: '~stage@other' },
                { name: '~stage@deploy' }
            ],
            edges: [
                { src: '~commit', dest: 'foo' },
                { src: 'foo', dest: 'A' },
                { src: 'stage@other', dest: 'B' },
                { src: 'foo', dest: 'B' },
                { src: 'A', dest: 'stage@deploy' }
            ]
        });
        assert.deepEqual(result.stageWorkflows, {
            other: {
                nodes: [
                    { name: 'stage@other:teardown' },
                    { name: 'main' },
                    { name: 'stage@other:setup' },
                    { name: 'publish' }
                ],
                edges: [{ src: 'main', dest: 'publish' }]
            },
            deploy: {
                nodes: [{ name: 'C' }, { name: 'stage@deploy:setup' }, { name: 'D' }],
                edges: [{ src: 'C', dest: 'D' }]
            }
        });
    });

    it('should handle logical OR requires', async () => {
        const pipelineConfig = {
            jobs: {
                foo: { requires: ['~commit'] },
                A: { requires: ['foo'] },
                B: { requires: ['foo'] },
                C: { requires: ['~A', '~B', '~sd@1234:foo'] }
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock
        });

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'foo' },
                { name: 'A' },
                { name: 'B' },
                { name: 'C' },
                { name: '~sd@1234:foo' }
            ],
            edges: [
                { src: '~commit', dest: 'foo' },
                { src: 'foo', dest: 'A' },
                { src: 'foo', dest: 'B' },
                { src: 'A', dest: 'C' },
                { src: 'B', dest: 'C' },
                { src: '~sd@1234:foo', dest: 'C' }
            ]
        });
    });

    it('should handle logical OR and logical AND requires', async () => {
        const pipelineConfig = {
            jobs: {
                foo: { requires: ['~commit'] },
                A: { requires: ['foo'] },
                B: { requires: ['foo'] },
                C: { requires: ['~A', '~B', 'D', 'E'] },
                D: {},
                E: {}
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock
        });

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'foo' },
                { name: 'A' },
                { name: 'B' },
                { name: 'C' },
                { name: 'D' },
                { name: 'E' }
            ],
            edges: [
                { src: '~commit', dest: 'foo' },
                { src: 'foo', dest: 'A' },
                { src: 'foo', dest: 'B' },
                { src: 'A', dest: 'C' },
                { src: 'B', dest: 'C' },
                { src: 'D', dest: 'C', join: true },
                { src: 'E', dest: 'C', join: true }
            ]
        });
    });

    it('should dedupe requires', async () => {
        const pipelineConfig = {
            jobs: {
                foo: { requires: ['A', 'A', 'A'] },
                A: {}
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock
        });

        assert.deepEqual(result, {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo' }, { name: 'A' }],
            edges: [{ src: 'A', dest: 'foo' }]
        });
    });

    it('should handle joins', async () => {
        const pipelineConfig = {
            jobs: {
                foo: {},
                bar: { requires: ['foo'] },
                baz: { requires: ['foo'] },
                bax: { requires: ['bar', 'baz'] }
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock
        });

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'foo' },
                { name: 'bar' },
                { name: 'baz' },
                { name: 'bax' }
            ],
            edges: [
                { src: 'foo', dest: 'bar' },
                { src: 'foo', dest: 'baz' },
                { src: 'bar', dest: 'bax', join: true },
                { src: 'baz', dest: 'bax', join: true }
            ]
        });
    });

    it('should remove ~ for downstream external trigger', async () => {
        triggerFactoryMock.getDestFromSrc.withArgs('sd@123:foo').resolves(['sd@111:baz', 'sd@1234:foo']);
        const pipelineConfig = {
            jobs: {
                main: { requires: ['~pr', '~commit'] },
                foo: { requires: ['main'] },
                bar: { requires: ['sd@111:baz', 'sd@1234:foo'] }
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock,
            pipelineId: 123
        });

        assert.deepEqual(result, EXPECTED_EXTERNAL_JOIN);
    });

    it('should handle external upstream & downstream join', async () => {
        /* A - B                                                   - C
             \ sd@111:external-level1 ->  sd@222:external-level2    /
             \ sd@333:external-level1 ->  sd@444:external-level2    /
                                          sd@555:external-level2    /
             \ ~sd@777:external-level1 -> ~sd@888:external-level2   /
        */
        triggerFactoryMock.getDestFromSrc
            .withArgs('sd@123:A')
            .resolves(['sd@111:external-level1', 'sd@333:external-level1']);
        triggerFactoryMock.getDestFromSrc.withArgs('~sd@123:A').resolves(['~sd@777:external-level1']);
        triggerFactoryMock.getDestFromSrc.withArgs('sd@111:external-level1').resolves(['sd@222:external-level2']);
        triggerFactoryMock.getDestFromSrc
            .withArgs('sd@333:external-level1')
            .resolves(['sd@444:external-level2', 'sd@555:external-level2']);
        triggerFactoryMock.getDestFromSrc.withArgs('sd@555:external-level2').resolves(['sd@666:external-level3']);
        triggerFactoryMock.getDestFromSrc.withArgs('~sd@777:external-level1').resolves(['~sd@888:external-level2']);

        const pipelineConfig = {
            jobs: {
                A: {},
                B: { requires: ['A'] },
                C: {
                    requires: [
                        'B',
                        'sd@222:external-level2',
                        'sd@444:external-level2',
                        'sd@555:external-level2',
                        '~sd@888:external-level2'
                    ]
                }
            }
        };
        const result = await getWorkflow({
            pipelineConfig,
            triggerFactory: triggerFactoryMock,
            pipelineId: 123
        });

        assert.deepEqual(result, EXPECTED_EXTERNAL_COMPLEX);
    });
});
