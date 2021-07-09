'use strict';

const getNextJobs = require('./getNextJobs');

/**
 * Recursively verify if there is a cycle starting from job
 * @method walk
 * @param  {Object} workflowGraph   Directed graph representation of workflow
 * @param  {String} jobName         Job Name
 * @param  {Set} visitedJobs        Unique list of visited jobs
 * @param  {Array} path             Recursive stack of a single path from node to leaf
 * @return {Boolean}                True if a cycle detected
 * @private
 */
const isCyclic = (workflowGraph, jobName, visitedJobs, path) => {
    visitedJobs.add(jobName);
    path.push(jobName);

    const triggerList = getNextJobs(workflowGraph, { trigger: jobName, prNum: 1 });

    const hasCycle = triggerList.some(name => {
        if (!visitedJobs.has(name)) {
            return isCyclic(workflowGraph, name, visitedJobs, path);
        }
        if (path.includes(name)) {
            // When a job is visited and is in the current path, then cycle detected
            return true;
        }

        return false;
    });

    // Remove job from current path
    path.pop(jobName);

    return hasCycle;
};

/**
 * Calculate if the workflow contains a cycle, e.g. A -> B -> A
 * @method hasCycle
 * @param  {Object}  workflowGraph  Graph representation of workflow
 * @return {Boolean}                True if a cycle exists anywhere in the workflow
 */
const hasCycle = workflowGraph =>
    // Check from all the nodes to capture deteached workflows
    workflowGraph.nodes.some(node => isCyclic(workflowGraph, node.name, new Set(), []));

module.exports = hasCycle;
