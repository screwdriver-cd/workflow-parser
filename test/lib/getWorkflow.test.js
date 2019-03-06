'use strict';

const assert = require('chai').assert;
const getWorkflow = require('../../lib/getWorkflow');

const REQUIRES_WORKFLOW = require('../data/requires-workflow');
const LEGACY_AND_REQUIRES_WORKFLOW = Object.assign({}, REQUIRES_WORKFLOW);

const EXTERNAL_TRIGGER = require('../data/requires-workflow-exttrigger');

const EXPECTED_OUTPUT = require('../data/expected-output');
const NO_EDGES = Object.assign({}, EXPECTED_OUTPUT);
const EXPECTED_EXTERNAL = require('../data/expected-external');

NO_EDGES.edges = [];

describe('getWorkflow', () => {
    it('should throw if it is not given correct input', () => {
        assert.throws(() => getWorkflow({ config: {} }),
            Error, 'No Job config provided');
    });

    it('should convert a config with job-requires workflow to directed graph', () => {
        assert.deepEqual(getWorkflow(REQUIRES_WORKFLOW),
            EXPECTED_OUTPUT, 'requires-style workflow');
        assert.deepEqual(getWorkflow(LEGACY_AND_REQUIRES_WORKFLOW),
            EXPECTED_OUTPUT, 'both legacy and non-legacy workflows');
        assert.deepEqual(getWorkflow(EXTERNAL_TRIGGER),
            EXPECTED_EXTERNAL, 'requires-style workflow with external trigger');
    });

    it('should handle detatched jobs', () => {
        const result = getWorkflow({
            jobs: {
                foo: {},
                bar: { requires: ['foo'] }
            }
        });

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: '~release' },
                { name: '~tag' },
                { name: 'foo' },
                { name: 'bar' }
            ],
            edges: [{ src: 'foo', dest: 'bar' }]
        });
    });

    it('should handle logical OR requires', () => {
        const result = getWorkflow({
            jobs: {
                foo: { requires: ['~commit'] },
                A: { requires: ['foo'] },
                B: { requires: ['foo'] },
                C: { requires: ['~A', '~B', '~sd@1234:foo'] }
            }
        });

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: '~release' },
                { name: '~tag' },
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

    it('should handle logical OR and logial AND requires', () => {
        const result = getWorkflow({
            jobs: {
                foo: { requires: ['~commit'] },
                A: { requires: ['foo'] },
                B: { requires: ['foo'] },
                C: { requires: ['~A', '~B', 'D', 'E'] },
                D: {},
                E: {}
            }
        });

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: '~release' },
                { name: '~tag' },
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

    it('should dedupe requires', () => {
        const result = getWorkflow({
            jobs: {
                foo: { requires: ['A', 'A', 'A'] },
                A: {}
            }
        });

        assert.deepEqual(result, {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: '~release' },
                { name: '~tag' },
                { name: 'foo' },
                { name: 'A' }
            ],
            edges: [
                { src: 'A', dest: 'foo' }
            ]
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
                { name: '~release' },
                { name: '~tag' },
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
