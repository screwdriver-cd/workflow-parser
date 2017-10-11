'use strict';

const assert = require('chai').assert;
const parser = require('../index');

describe('index test', () => {
    it('should bundle all its libraries', () => {
        assert.isFunction(parser.getWorkflow);
        assert.isFunction(parser.getNextJobs);
    });
});
