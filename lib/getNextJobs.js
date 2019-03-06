'use strict';

const { PR_JOB_NAME } = require('screwdriver-data-schema').config.regex;

/**
 * Calculate the next jobs to execute, given a workflow and a trigger job
 * @method getNextJobs
 * @param  {Object}    workflowGraph    Directed graph representation of workflow
 * @param  {Object}    config
 * @param  {String}    config.trigger      The triggering event (~pr, ~commit, jobName)
 * @param  {String}    [config.prNum]      The PR number (required when ~pr trigger)
 * @param  {Boolean}   [config.prChain]    The flag for PR jobs will trigger subsequent jobs
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

    // Check if the job is triggerd by prChain with regexp
    const prChainTrigger = config.trigger.match(PR_JOB_NAME);

    workflowGraph.edges.forEach((edge) => {
        // Check if edge src is specific branch commit or pr with regexp
        const edgeSrcBranchRegExp = new RegExp('^~(pr|commit|release|tag):/(.+)/$');
        const edgeSrcBranch = edge.src.match(edgeSrcBranchRegExp);

        if (edgeSrcBranch) {
            // Check if trigger is specific branch commit or pr
            const triggerBranchRegExp = new RegExp('^~(pr|commit|release|tag):(.+)$');
            const triggerBranch = config.trigger.match(triggerBranchRegExp);

            // Check whether job types of trigger and edge src match
            if (triggerBranch && triggerBranch[1] === edgeSrcBranch[1]) {
                // Check if trigger branch and edge src branch regex match
                if (triggerBranch[2].match(edgeSrcBranch[2])) {
                    jobs.add(edge.dest);
                }
            }
        } else if (edge.src === config.trigger) {
            // Make PR jobs PR-$num:$cloneJob (not sure how to better handle multiple PR jobs)
            if (config.trigger === '~pr') {
                jobs.add(`PR-${config.prNum}:${edge.dest}`);
            } else {
                jobs.add(edge.dest);
            }
        // prChainTrigger[1] must be 'PR-$num' if matches regexp
        } else if (config.prChain
                && prChainTrigger && config.trigger === `${prChainTrigger[1]}:${edge.src}`) {
            jobs.add(`${prChainTrigger[1]}:${edge.dest}`);
        }
    });

    return Array.from(jobs);
};

module.exports = getNextJobs;
