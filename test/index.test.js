'use strict';

const { assert } = require('chai');
const parser = require('../index');

describe('index test', () => {
    it('should bundle all its libraries', () => {
        assert.isFunction(parser.getWorkflow);
        assert.isFunction(parser.getNextJobs);
        assert.isFunction(parser.hasCycle);
    });
});
