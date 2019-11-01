'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const getWorkflow = require('../../lib/getWorkflow');
const REQUIRES_WORKFLOW = require('../data/requires-workflow');
const LEGACY_AND_REQUIRES_WORKFLOW = Object.assign({}, REQUIRES_WORKFLOW);
const EXTERNAL_TRIGGER = require('../data/requires-workflow-exttrigger');
const EXPECTED_OUTPUT = require('../data/expected-output');
const NO_EDGES = Object.assign({}, EXPECTED_OUTPUT);
const EXPECTED_EXTERNAL = require('../data/expected-external');
const EXPECTED_EXTERNAL_COMPLEX = require('../data/expected-external-complex');

NO_EDGES.edges = [];

describe.only('getWorkflow', () => {
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

    it('should handle detatched jobs', async () => {
        const result = await getWorkflow({
            jobs: {
                foo: {},
                bar: { requires: ['foo'] }
            }
        }, triggerFactoryMock);

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'foo' },
                { name: 'bar' }
            ],
            edges: [{ src: 'foo', dest: 'bar' }]
        });
    });

    it('should handle logical OR requires', async () => {
        const result = await getWorkflow({
            jobs: {
                foo: { requires: ['~commit'] },
                A: { requires: ['foo'] },
                B: { requires: ['foo'] },
                C: { requires: ['~A', '~B', '~sd@1234:foo'] }
            }
        }, triggerFactoryMock);

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

    it('should handle logical OR and logial AND requires', async () => {
        const result = await getWorkflow({
            jobs: {
                foo: { requires: ['~commit'] },
                A: { requires: ['foo'] },
                B: { requires: ['foo'] },
                C: { requires: ['~A', '~B', 'D', 'E'] },
                D: {},
                E: {}
            }
        }, triggerFactoryMock);

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
        const result = await getWorkflow({
            jobs: {
                foo: { requires: ['A', 'A', 'A'] },
                A: {}
            }
        }, triggerFactoryMock);

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'foo' },
                { name: 'A' }
            ],
            edges: [
                { src: 'A', dest: 'foo' }
            ]
        });
    });

    it('should handle joins', async () => {
        const result = await getWorkflow({
            jobs: {
                foo: { },
                bar: { requires: ['foo'] },
                baz: { requires: ['foo'] },
                bax: { requires: ['bar', 'baz'] }
            }
        }, triggerFactoryMock);

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

    it('should handle external upstream & downstream join', async () => {
        /* A - B                                                   - C
             \ sd@111:external-level1 ->  sd@222:external-level2    /
             \ sd@333:external-level1 ->  sd@444:external-level2    /
                                          sd@555:external-level2    /
             \ ~sd@777:external-level1 -> ~sd@888:external-level2   /
        */
        triggerFactoryMock.getDestFromSrc.withArgs('sd@123:A').resolves([
            'sd@111:external-level1',
            'sd@333:external-level1'
        ]);
        triggerFactoryMock.getDestFromSrc.withArgs('~sd@123:A').resolves([
            '~sd@777:external-level1'
        ]);
        triggerFactoryMock.getDestFromSrc.withArgs('sd@111:external-level1').resolves([
            'sd@222:external-level2'
        ]);
        triggerFactoryMock.getDestFromSrc.withArgs('sd@333:external-level1').resolves([
            'sd@444:external-level2', 'sd@555:external-level2'
        ]);
        triggerFactoryMock.getDestFromSrc.withArgs('sd@555:external-level2').resolves([
            'sd@666:external-level3'
        ]);
        triggerFactoryMock.getDestFromSrc.withArgs('~sd@777:external-level1').resolves([
            '~sd@888:external-level2'
        ]);

        const result = await getWorkflow({
            jobs: {
                A: { },
                B: { requires: ['A'] },
                C: { requires: [
                    'B',
                    'sd@222:external-level2',
                    'sd@444:external-level2',
                    'sd@555:external-level2',
                    '~sd@888:external-level2'
                ] }
            }
        }, triggerFactoryMock, 123);

        assert.deepEqual(result, EXPECTED_EXTERNAL_COMPLEX);
    });
});
