'use strict';

const getWorkflow = require('./lib/getWorkflow');
const getNextJobs = require('./lib/getNextJobs');
const getSrcForJoin = require('./lib/getSrcForJoin');
const getFlattenedWorkflow = require('./lib/getFlattenedWorkflow');
const hasCycle = require('./lib/hasCycle');
const hasJoin = require('./lib/hasJoin');

module.exports = { getWorkflow, getNextJobs, getSrcForJoin, getFlattenedWorkflow, hasCycle, hasJoin };
