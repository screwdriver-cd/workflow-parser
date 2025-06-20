'use strict';

const { assert } = require('chai');
const getNextJobs = require('../../lib/getNextJobs');
const WORKFLOW = require('../data/expected-output.json');
const EXTERNAL_WORKFLOW = require('../data/expected-external.json');
const EXTERNAL_COMPLEX_WORKFLOW = require('../data/expected-external-complex.json');
const EXTERNAL_JOIN_WORKFLOW = require('../data/expected-external-join.json');
const PR_STAGE_WORKFLOW = require('../data/pr-stage-workflow.json');

describe('getNextJobs', () => {
    it('should throw if trigger not provided', () => {
        assert.throws(() => getNextJobs(WORKFLOW, {}), Error, 'Must provide a trigger');
    });

    it('should throw if prNum not provided for ~pr events', () => {
        assert.throws(
            () => getNextJobs(WORKFLOW, { trigger: '~pr' }),
            Error,
            'Must provide a PR number with "~pr" trigger'
        );
    });

    it('should figure out what jobs start next', () => {
        // trigger for a stage setup with the startFrom as a stage setup job
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'stage@integration:setup',
                startFrom: 'ci-test'
            }),
            ['ci-test']
        );
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'PR-1:stage@integration:setup',
                startFrom: 'PR-1:ci-test'
            }),
            ['PR-1:ci-test']
        );
        // trigger for a stage setup with the startFrom as a stage
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'stage@integration:setup',
                startFrom: 'stage@integration'
            }),
            ['ci-deploy']
        );
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'PR-1:stage@integration:setup',
                startFrom: 'PR-1:stage@integration'
            }),
            ['PR-1:ci-deploy']
        );
        // trigger for a stage setup with the startFrom as the stage setup of same stage
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'stage@integration:setup',
                startFrom: 'stage@integration:setup'
            }),
            ['ci-deploy']
        );
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'PR-1:stage@integration:setup',
                startFrom: 'PR-1:stage@integration:setup'
            }),
            ['PR-1:ci-deploy']
        );
        // trigger for a stage setup with the startFrom as the stage job in a different stage
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'stage@integration:setup',
                startFrom: 'a-test'
            }),
            ['ci-deploy']
        );
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'PR-1:stage@integration:setup',
                startFrom: 'PR-1:a-test'
            }),
            ['PR-1:ci-deploy']
        );
        // trigger for a stage setup with the startFrom as the stage setup of a different stage
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'stage@integration:setup',
                startFrom: 'stage@alpha:setup'
            }),
            ['ci-deploy']
        );
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'PR-1:stage@integration:setup',
                startFrom: 'PR-1:stage@alpha:setup'
            }),
            ['PR-1:ci-deploy']
        );
        // trigger for a pr event
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: '~pr',
                prNum: '123'
            }),
            ['PR-123:main']
        );
        // trigger for a pr-closed event
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: '~pr-closed'
            }),
            ['closed']
        );

        // trigger for commit event
        assert.deepEqual(getNextJobs(WORKFLOW, { trigger: '~commit' }), ['main']);
        // trigger for release event
        assert.deepEqual(getNextJobs(WORKFLOW, { trigger: '~release' }), ['baz']);
        // trigger for tag event
        assert.deepEqual(getNextJobs(WORKFLOW, { trigger: '~tag' }), ['baz']);
        // trigger after job "main"
        assert.deepEqual(getNextJobs(WORKFLOW, { trigger: 'main' }), ['foo']);
        // trigger after job "foo"
        assert.deepEqual(getNextJobs(WORKFLOW, { trigger: 'foo' }), ['bar']);
        // trigger after job "bar""
        assert.deepEqual(getNextJobs(WORKFLOW, { trigger: 'bar' }), []);
        // trigger after non-existing job "main"
        assert.deepEqual(getNextJobs(WORKFLOW, { trigger: 'banana' }), []);
        // trigger for a pr event with chainPR
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: '~pr',
                prNum: '123',
                chainPR: true
            }),
            ['PR-123:main']
        );
        // trigger after job "PR-123:main" with chainPR
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'PR-123:main',
                chainPR: true
            }),
            ['PR-123:foo']
        );
        // trigger after job "PR-123:foo" with chainPR
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'PR-123:foo',
                chainPR: true
            }),
            ['PR-123:bar']
        );
        // trigger after job "PR-123:var" with chainPR
        assert.deepEqual(
            getNextJobs(WORKFLOW, {
                trigger: 'PR-123:bar',
                chainPR: true
            }),
            []
        );
    });

    it('should figure out what PR stage jobs start next', () => {
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: '~pr',
                prNum: 123
            }),
            ['PR-123:hub', 'PR-123:stage@simple:setup']
        );
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: 'PR-123:stage@simple:setup'
            }),
            ['PR-123:a', 'PR-123:b']
        );
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: 'PR-123:a'
            }),
            []
        );
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: 'PR-123:b'
            }),
            []
        );
        // ChainPR enabled
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: '~pr',
                chainPR: true,
                prNum: 123
            }),
            ['PR-123:hub', 'PR-123:stage@simple:setup']
        );
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: 'PR-123:stage@simple:setup',
                chainPR: true
            }),
            ['PR-123:a', 'PR-123:b', 'PR-123:e']
        );
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: 'PR-123:a',
                chainPR: true
            }),
            ['PR-123:c']
        );
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: 'PR-123:b',
                chainPR: true
            }),
            ['PR-123:stage@simple:teardown']
        );
        assert.deepEqual(
            getNextJobs(PR_STAGE_WORKFLOW, {
                trigger: 'PR-123:stage@simple:teardown',
                chainPR: true
            }),
            ['PR-123:target']
        );
    });

    it('should figure out what jobs start next with parallel workflow with external', () => {
        assert.deepEqual(getNextJobs(EXTERNAL_WORKFLOW, { trigger: 'sd@111:baz' }), ['bar']);
    });

    it('should figure out what jobs start next with parallel workflow', () => {
        const parallelWorkflow = {
            edges: [
                { src: 'a', dest: 'b' },
                { src: 'a', dest: 'c' },
                { src: 'a', dest: 'd' },
                { src: 'b', dest: 'e' }
            ]
        };

        // trigger multiple after job "a"
        assert.deepEqual(getNextJobs(parallelWorkflow, { trigger: 'a' }), ['b', 'c', 'd']);
        // trigger one after job "b"
        assert.deepEqual(getNextJobs(parallelWorkflow, { trigger: 'b' }), ['e']);
    });

    it('should figure out what jobs start next with specific branch workflow', () => {
        const specificBranchWorkflow = {
            edges: [
                { src: '~commit', dest: 'a' },
                { src: '~commit:foo', dest: 'b' },
                { src: '~commit:/foo-/', dest: 'c' },
                { src: '~commit:/^bar-.*$/', dest: 'd' },
                { src: '~pr:foo', dest: 'e' },
                { src: '~pr:/foo-/', dest: 'f' },
                { src: '~pr:/^bar-.*$/', dest: 'g' }
            ]
        };

        // trigger own pipeline commit
        assert.deepEqual(getNextJobs(specificBranchWorkflow, { trigger: '~commit' }), ['a']);
        // trigger "foo" branch commit
        assert.deepEqual(getNextJobs(specificBranchWorkflow, { trigger: '~commit:foo' }), ['b']);
        // trigger "foo-bar-dev" branch commit
        assert.deepEqual(getNextJobs(specificBranchWorkflow, { trigger: '~commit:foo-bar-dev' }), ['c']);
        // trigger "bar-foo-prod" branch commit
        assert.deepEqual(getNextJobs(specificBranchWorkflow, { trigger: '~commit:bar-foo-prod' }), ['c', 'd']);
        // trigger by a pull request on "foo" branch
        assert.deepEqual(getNextJobs(specificBranchWorkflow, { trigger: '~pr:foo', prNum: '123' }), ['PR-123:e']);
        // trigger by a pull request on "foo-bar-dev" branch
        assert.deepEqual(getNextJobs(specificBranchWorkflow, { trigger: '~pr:foo-bar-dev', prNum: '123' }), [
            'PR-123:f'
        ]);
        // trigger by a pull request on "bar-foo-prod" branch
        assert.deepEqual(getNextJobs(specificBranchWorkflow, { trigger: '~pr:bar-foo-prod', prNum: '123' }), [
            'PR-123:f',
            'PR-123:g'
        ]);
    });

    it('should figure out what jobs start next with external workflow', () => {
        /* A - B                                                   - C
             \ sd@111:external-level1 ->  sd@222:external-level2    /
             \ sd@333:external-level1 ->  sd@444:external-level2    /
                                          sd@555:external-level2    /
             \ ~sd@777:external-level1 -> ~sd@888:external-level2   /
        */
        assert.deepEqual(getNextJobs(EXTERNAL_COMPLEX_WORKFLOW, { trigger: 'A' }), [
            'sd@777:external-level1',
            'sd@111:external-level1',
            'sd@333:external-level1',
            'B'
        ]);
        assert.deepEqual(getNextJobs(EXTERNAL_COMPLEX_WORKFLOW, { trigger: 'B' }), ['C']);
    });

    it('should not return external job on pr trigger', () => {
        assert.deepEqual(getNextJobs(EXTERNAL_JOIN_WORKFLOW, { trigger: '~pr', prNum: '1', chainPR: true }), [
            'PR-1:main'
        ]);
        assert.deepEqual(getNextJobs(EXTERNAL_JOIN_WORKFLOW, { trigger: 'PR-1:main', prNum: '1', chainPR: true }), [
            'PR-1:foo'
        ]);
        assert.deepEqual(getNextJobs(EXTERNAL_JOIN_WORKFLOW, { trigger: 'PR-1:foo', prNum: '1', chainPR: true }), []);
    });
});
