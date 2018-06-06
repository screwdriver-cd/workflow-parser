'use strict';

/**
 * Calculate the next jobs to execute, given a workflow and a trigger job
 * @method getNextJobs
 * @param  {Object}    workflowGraph    Directed graph representation of workflow
 * @param  {Object}    config
 * @param  {String}    config.trigger      The triggering event (~pr, ~commit, jobName)
 * @param  {String}    [config.prNum]      The PR number (required when ~pr trigger)
 * @return {Array}                      List of job names
 */
const getNextJobs = (workflowGraph, config) => {
    const jobs = new Set();

    if (!config || !config.trigger) {
        throw new Error('Must provide a trigger');
    }

    if (config.trigger === '~pr' && !config.prNum) {
        throw new Error('Must provide a PR number with "~pr" trigger');
    }

    workflowGraph.edges.forEach((edge) => {
        // Check if edge src is specific branch commit with regexp
        const edgeSrcBranchRegExp = new RegExp('^~commit:/(.+)/$');
        const edgeSrcBranch = edge.src.match(edgeSrcBranchRegExp);

        if (edgeSrcBranch) {
            // Check if trigger is specific branch commit
            const triggerBranchRegExp = new RegExp('^~commit:(.+)$');
            const triggerBranch = config.trigger.match(triggerBranchRegExp);

            if (triggerBranch) {
                if (triggerBranch[1].match(edgeSrcBranch[1])) {
                    jobs.add(edge.dest);
                }
            }
        } else if (edge.src === config.trigger) {
            // Make PR jobs PR-$num:$cloneJob (not sure how to better handle multiple PR jobs)
            jobs.add(config.trigger === '~pr' ? `PR-${config.prNum}:${edge.dest}` : edge.dest);
        }
    });

    return Array.from(jobs);
};

module.exports = getNextJobs;
