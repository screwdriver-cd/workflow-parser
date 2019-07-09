'use strict';

const assert = require('chai').assert;
const getSrcForJoin = require('../../lib/getSrcForJoin');
const WORKFLOW = require('../data/join-workflow');
const rewire = require('rewire');

const rewireGetSrcForJoin = rewire('../../lib/getSrcForJoin');

/* eslint-disable no-underscore-dangle */
describe('getSrcForJoin', () => {
    it('should throw if job not provided', () => {
        assert.throws(() => getSrcForJoin(WORKFLOW, {}),
            Error, 'Must provide a job');
    });

    it('should figure out what src for the job if it is a join', () => {
        // src nodes for join job
        assert.deepEqual(getSrcForJoin(WORKFLOW, {
            jobName: 'foo'
        }), [
            { name: 'main', id: 1 },
            { name: 'other_main', id: 2 }
        ]);
        // return empty arry if it's not a join job
        assert.deepEqual(getSrcForJoin(WORKFLOW, { jobName: 'bar' }), []);
    });
});

describe('isPR', () => {
    const isPR = rewireGetSrcForJoin.__get__('isPR');

    it('sholud return true if job name has PR prefix', () => {
        assert.isTrue(isPR('PR-1:testJobName'));
    });

    it('sholud return false if job name does not have PR prefix', () => {
        assert.isFalse(isPR('testJobName'));
    });
});

describe('findJobs', () => {
    it('should find jobs when search job is joined job', () => {
        const findJobs = rewireGetSrcForJoin.__get__('findJobs');
        const destJobName = 'foo';

        assert.deepEqual(findJobs(WORKFLOW, destJobName),
            new Set([{ name: 'main', id: 1 }, { name: 'other_main', id: 2 }]));
    });

    it('should not find jobs when search job is not joined job', () => {
        const findJobs = rewireGetSrcForJoin.__get__('findJobs');
        const destJobName = 'bar';

        assert.deepEqual(findJobs(WORKFLOW, destJobName), new Set());
    });
});

describe('findPRJobs', () => {
    it('should find jobs when search job is joined job', () => {
        const findPRJobs = rewireGetSrcForJoin.__get__('findPRJobs');
        const destJobName = 'PR-179:foo';

        assert.deepEqual(findPRJobs(WORKFLOW, destJobName),
            new Set([{ name: 'PR-179:main', id: 1 }, { name: 'PR-179:other_main', id: 2 }]));
    });

    it('should not find jobs when search job is not joined job', () => {
        const findPRJobs = rewireGetSrcForJoin.__get__('findPRJobs');
        const destJobName = 'PR-179:bar';

        assert.deepEqual(findPRJobs(WORKFLOW, destJobName), new Set());
    });
});

describe('getJoinJobs', () => {
    it('should not return PR join jobs', () => {
        const getJoinJobs = rewireGetSrcForJoin.__get__('getJoinJobs');
        const destJobName = 'foo';

        assert.deepEqual(getJoinJobs(WORKFLOW, destJobName),
            new Set([{ name: 'main', id: 1 }, { name: 'other_main', id: 2 }]));
    });
});
