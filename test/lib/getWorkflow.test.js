'use strict';

const assert = require('chai').assert;
const getWorkflow = require('../../lib/getWorkflow');

const LEGACY_NO_WORKFLOW = require('../data/legacy-no-workflow');
const LEGACY_WITH_WORKFLOW = Object.assign({}, LEGACY_NO_WORKFLOW);

LEGACY_WITH_WORKFLOW.workflow = ['foo', 'bar'];

const REQUIRES_WORKFLOW = require('../data/requires-workflow');
const LEGACY_AND_REQUIRES_WORKFLOW = Object.assign({}, REQUIRES_WORKFLOW);

LEGACY_WITH_WORKFLOW.workflow = ['foo', 'bar'];

const EXPECTED_OUTPUT = require('../data/expected-output');
const NO_EDGES = Object.assign({}, EXPECTED_OUTPUT);

NO_EDGES.edges = [];

describe('getWorkflow', () => {
    it('should throw if it is not given correct input', () => {
        assert.throws(() => getWorkflow({ config: {} }),
            Error, 'No Job config provided');
    });

    it('should produce directed graph when legacy mode is on', () => {
        assert.deepEqual(getWorkflow(LEGACY_NO_WORKFLOW, {
            useLegacy: true
        }), EXPECTED_OUTPUT, 'no legacy workflow defined');
        assert.deepEqual(getWorkflow(LEGACY_WITH_WORKFLOW, {
            useLegacy: true
        }), EXPECTED_OUTPUT, 'has legacy workflow defined');
        assert.deepEqual(getWorkflow(REQUIRES_WORKFLOW, {
            useLegacy: true
        }), EXPECTED_OUTPUT, 'requires-style workflow');
        assert.deepEqual(getWorkflow(LEGACY_AND_REQUIRES_WORKFLOW, {
            useLegacy: true
        }), EXPECTED_OUTPUT, 'both legacy and non-legacy workflows');
    });

    it('should convert a legacy config to graph with no edges when legacy mode off', () => {
        assert.deepEqual(getWorkflow(LEGACY_WITH_WORKFLOW),
            NO_EDGES, 'has legacy workflow defined');
        assert.deepEqual(getWorkflow(LEGACY_NO_WORKFLOW),
            NO_EDGES, 'legacy, no workflow defined');
    });

    it('should convert a config with job-requires workflow to directed graph', () => {
        assert.deepEqual(getWorkflow(REQUIRES_WORKFLOW),
            EXPECTED_OUTPUT, 'requires-style workflow');
        assert.deepEqual(getWorkflow(LEGACY_AND_REQUIRES_WORKFLOW),
            EXPECTED_OUTPUT, 'both legacy and non-legacy workflows');
    });

    it('should handle detatched jobs', () => {
        const result = getWorkflow({
            jobs: {
                foo: {},
                bar: { requires: ['foo'] }
            }
        });

        assert.deepEqual(result, {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo' }, { name: 'bar' }],
            edges: [{ src: 'foo', dest: 'bar' }]
        });
    });

    it('should handle joins', () => {
        const result = getWorkflow({
            jobs: {
                foo: { },
                bar: { requires: ['foo'] },
                baz: { requires: ['foo'] },
                bax: { requires: ['bar', 'baz'] }
            }
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
});
