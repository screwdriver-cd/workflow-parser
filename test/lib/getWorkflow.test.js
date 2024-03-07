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
            await getWorkflow({ config: {} }, triggerFactoryMock);
        } catch (e) {
            assert.equal(e.message, 'No Job config provided');
        }
    });

    it('should convert a config with job-requires workflow to directed graph', async () => {
        const requires = await getWorkflow(REQUIRES_WORKFLOW, triggerFactoryMock);
        const legacyRequires = await getWorkflow(LEGACY_AND_REQUIRES_WORKFLOW, triggerFactoryMock);
        const external = await getWorkflow(EXTERNAL_TRIGGER, triggerFactoryMock);

        assert.deepEqual(requires, EXPECTED_OUTPUT);
        assert.deepEqual(legacyRequires, EXPECTED_OUTPUT);
        assert.deepEqual(external, EXPECTED_EXTERNAL);
    });

    it('should handle displayName', async () => {
        const result = await getWorkflow(
            {
                jobs: {
                    foo: {
                        annotations: {
                            'screwdriver.cd/displayName': 'baz'
                        }
                    },
                    bar: {}
                }
            },
            triggerFactoryMock
        );

        assert.deepEqual(result, {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo', displayName: 'baz' }, { name: 'bar' }],
            edges: []
        });
    });

    it('should handle detatched jobs', async () => {
        const result = await getWorkflow(
            {
                jobs: {
                    foo: {},
                    bar: { requires: ['foo'] }
                }
            },
            triggerFactoryMock
        );

        assert.deepEqual(result, {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo' }, { name: 'bar' }],
            edges: [{ src: 'foo', dest: 'bar', join: true }]
        });
    });

    it('should handle logical OR requires', async () => {
        const result = await getWorkflow(
            {
                jobs: {
                    foo: { requires: ['~commit'] },
                    A: { requires: ['foo'] },
                    B: { requires: ['foo'] },
                    C: { requires: ['~A', '~B', '~sd@1234:foo'] }
                }
            },
            triggerFactoryMock
        );

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
                { src: 'foo', dest: 'A', join: true },
                { src: 'foo', dest: 'B', join: true },
                { src: 'A', dest: 'C' },
                { src: 'B', dest: 'C' },
                { src: '~sd@1234:foo', dest: 'C' }
            ]
        });
    });

    it('should handle logical OR and logial AND requires', async () => {
        const result = await getWorkflow(
            {
                jobs: {
                    foo: { requires: ['~commit'] },
                    A: { requires: ['foo'] },
                    B: { requires: ['foo'] },
                    C: { requires: ['~A', '~B', 'D', 'E'] },
                    D: {},
                    E: {}
                }
            },
            triggerFactoryMock
        );

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
                { src: 'foo', dest: 'A', join: true },
                { src: 'foo', dest: 'B', join: true },
                { src: 'A', dest: 'C' },
                { src: 'B', dest: 'C' },
                { src: 'D', dest: 'C', join: true },
                { src: 'E', dest: 'C', join: true }
            ]
        });
    });

    it('should dedupe requires', async () => {
        const result = await getWorkflow(
            {
                jobs: {
                    foo: { requires: ['A', 'A', 'A'] },
                    A: {}
                }
            },
            triggerFactoryMock
        );

        assert.deepEqual(result, {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo' }, { name: 'A' }],
            edges: [{ src: 'A', dest: 'foo', join: true }]
        });
    });

    it('should handle joins', async () => {
        const result = await getWorkflow(
            {
                jobs: {
                    foo: {},
                    bar: { requires: ['foo'] },
                    baz: { requires: ['foo'] },
                    bax: { requires: ['bar', 'baz'] }
                }
            },
            triggerFactoryMock
        );

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
                { src: 'foo', dest: 'bar', join: true },
                { src: 'foo', dest: 'baz', join: true },
                { src: 'bar', dest: 'bax', join: true },
                { src: 'baz', dest: 'bax', join: true }
            ]
        });
    });

    it('should remove ~ for downstream external trigger', async () => {
        triggerFactoryMock.getDestFromSrc.withArgs('sd@123:foo').resolves(['sd@111:baz', 'sd@1234:foo']);
        const result = await getWorkflow(
            {
                jobs: {
                    main: { requires: ['~pr', '~commit'] },
                    foo: { requires: ['main'] },
                    bar: { requires: ['sd@111:baz', 'sd@1234:foo'] }
                }
            },
            triggerFactoryMock,
            123
        );

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

        const result = await getWorkflow(
            {
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
            },
            triggerFactoryMock,
            123
        );

        assert.deepEqual(result, EXPECTED_EXTERNAL_COMPLEX);
    });

    describe('should handle stages', async () => {
        const PIPELINE_CONFIG = {
            jobs: {
                'stage@alpha:setup': { requires: ['~commit'], stage: { name: 'alpha' } },
                'alpha-deploy': { requires: ['stage@alpha:setup'], stage: { name: 'alpha' } },
                'alpha-test': { requires: ['alpha-deploy'], stage: { name: 'alpha' } },
                'alpha-certify': { requires: ['alpha-test'], stage: { name: 'alpha' } },
                'stage@alpha:teardown': { requires: ['alpha-certify'], stage: { name: 'alpha' } },
                'stage@beta:setup': { requires: ['~stage@alpha:teardown'], stage: { name: 'beta' } },
                'beta-deploy': { requires: ['~stage@beta:setup'], stage: { name: 'beta' } },
                'beta-test': { requires: ['~beta-deploy'], stage: { name: 'beta' } },
                'beta-certify': { requires: ['~beta-test'], stage: { name: 'beta' } },
                'stage@beta:teardown': { requires: ['~beta-certify'], stage: { name: 'beta' } },
                'stage@gamma:setup': { requires: ['triggering-a-stage'], stage: { name: 'gamma' } },
                'gamma-deploy': { requires: ['stage@gamma:setup'], stage: { name: 'gamma' } },
                'gamma-test-integration': { requires: ['gamma-deploy'], stage: { name: 'gamma' } },
                'gamma-test-functional': { requires: ['gamma-deploy'], stage: { name: 'gamma' } },
                'gamma-certify': {
                    requires: ['gamma-test-integration', 'gamma-test-functional'],
                    stage: { name: 'gamma' }
                },
                'stage@gamma:teardown': { requires: ['gamma-certify'], stage: { name: 'gamma' } },
                'triggering-a-stage': { requires: ['~commit'] },
                'triggered-by-a-stage-job': { requires: ['gamma-test-integration'] },
                'triggered-after-a-stage': { requires: ['stage@gamma:teardown'] }
            },
            stages: {
                alpha: {
                    description: 'stage for alpha environment',
                    jobs: ['alpha-deploy', 'alpha-test', 'alpha-certify']
                },
                beta: {
                    description: 'stage for beta environment',
                    jobs: ['beta-deploy', 'beta-test', 'beta-certify']
                },
                gamma: {
                    description: 'stage for gamma environment',
                    jobs: ['gamma-deploy', 'gamma-test-integration', 'gamma-test-functional', 'gamma-certify']
                }
            }
        };

        const EXPECTED_WORKFLOW_GRAPH = {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'stage@alpha:setup', stageName: 'alpha' },
                { name: 'alpha-deploy', stageName: 'alpha' },
                { name: 'alpha-test', stageName: 'alpha' },
                { name: 'alpha-certify', stageName: 'alpha' },
                { name: 'stage@alpha:teardown', stageName: 'alpha' },
                { name: 'stage@beta:setup', stageName: 'beta' },
                { name: 'beta-deploy', stageName: 'beta' },
                { name: 'beta-test', stageName: 'beta' },
                { name: 'beta-certify', stageName: 'beta' },
                { name: 'stage@beta:teardown', stageName: 'beta' },
                { name: 'stage@gamma:setup', stageName: 'gamma' },
                { name: 'triggering-a-stage' },
                { name: 'gamma-deploy', stageName: 'gamma' },
                { name: 'gamma-test-integration', stageName: 'gamma' },
                { name: 'gamma-test-functional', stageName: 'gamma' },
                { name: 'gamma-certify', stageName: 'gamma' },
                { name: 'stage@gamma:teardown', stageName: 'gamma' },
                { name: 'triggered-by-a-stage-job' },
                { name: 'triggered-after-a-stage' }
            ],
            edges: [
                { src: '~commit', dest: 'stage@alpha:setup' },
                { src: 'stage@alpha:setup', dest: 'alpha-deploy', join: true },
                { src: 'alpha-deploy', dest: 'alpha-test', join: true },
                { src: 'alpha-test', dest: 'alpha-certify', join: true },
                { src: 'alpha-certify', dest: 'stage@alpha:teardown', join: true },
                { src: 'stage@alpha:teardown', dest: 'stage@beta:setup' },
                { src: 'stage@beta:setup', dest: 'beta-deploy' },
                { src: 'beta-deploy', dest: 'beta-test' },
                { src: 'beta-test', dest: 'beta-certify' },
                { src: 'beta-certify', dest: 'stage@beta:teardown' },
                { src: 'triggering-a-stage', dest: 'stage@gamma:setup', join: true },
                { src: 'stage@gamma:setup', dest: 'gamma-deploy', join: true },
                { src: 'gamma-deploy', dest: 'gamma-test-integration', join: true },
                { src: 'gamma-deploy', dest: 'gamma-test-functional', join: true },
                { src: 'gamma-test-integration', dest: 'gamma-certify', join: true },
                { src: 'gamma-test-functional', dest: 'gamma-certify', join: true },
                { src: 'gamma-certify', dest: 'stage@gamma:teardown', join: true },
                { src: '~commit', dest: 'triggering-a-stage' },
                { src: 'gamma-test-integration', dest: 'triggered-by-a-stage-job', join: true },
                { src: 'stage@gamma:teardown', dest: 'triggered-after-a-stage', join: true }
            ]
        };

        it('generate workflow graph when triggerFactory is available', async () => {
            const result = await getWorkflow(PIPELINE_CONFIG, triggerFactoryMock);

            assert.deepEqual(result, EXPECTED_WORKFLOW_GRAPH);
        });

        it('generate workflow graph when triggerFactory is unavailable', async () => {
            const result = await getWorkflow(PIPELINE_CONFIG, null);

            assert.deepEqual(result, EXPECTED_WORKFLOW_GRAPH);
        });
    });
});
