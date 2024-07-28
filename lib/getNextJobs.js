'use strict';

const { PR_JOB_NAME, EXTERNAL_TRIGGER_ALL } = require('screwdriver-data-schema').config.regex;
const STAGE_SETUP_PATTERN = /^stage@([\w-]+)(?::setup)$/;

/**
 * Check if the job is setup job with setup suffix
 * @param  {String} jobName                 Job name
 * @return {Boolean}
 */
function isStageSetup(jobName) {
    return STAGE_SETUP_PATTERN.test(jobName);
}

/**
 * Check if the job is a stage job
 * @param  {String} jobName                 Job name
 * @param  {Object} workflowGraph           Workflow Graph
 * @return {Boolean}
 */
function isStageJob(workflowGraph, jobName) {
    const jobNode = workflowGraph.nodes.find(n => n.name === jobName);

    return jobNode.stageName !== undefined;
}

/**
 * Calculate the next jobs to execute, given a workflow and a trigger job
 * @method getNextJobs
 * @param  {Object}    workflowGraph    Directed graph representation of workflow
 * @param  {Object}    config
 * @param  {String}    config.trigger      The triggering event (~pr, ~commit, jobName)
 * @param  {String}    [config.prNum]      The PR number (required when ~pr trigger)
 * @param  {Boolean}   [config.chainPR]    The flag for PR jobs will trigger subsequent jobs
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

    if (
        isStageSetup(config.trigger) &&
        config.startFrom !== undefined &&
        !isStageSetup(config.startFrom) &&
        isStageJob(workflowGraph, config.startFrom)
    ) {
        jobs.add(config.startFrom);

        return Array.from(jobs);
    }

    // Check if the job is triggerd by chainPR with regexp
    const chainPRTrigger = config.trigger.match(PR_JOB_NAME);

    workflowGraph.edges.forEach(edge => {
        // Check if edge src is specific branch commit or pr with regexp
        const edgeSrcBranchRegExp = /^~(pr|commit|release|tag|subscribe):\/(.+)\/$/;
        const edgeSrcBranch = edge.src.match(edgeSrcBranchRegExp);

        if (edgeSrcBranch) {
            // Check if trigger is specific branch commit or pr
            const triggerBranchRegExp = /^~(pr|commit|release|tag|subscribe):(.+)$/;
            const triggerBranch = config.trigger.match(triggerBranchRegExp);

            // Check whether job types of trigger and edge src match
            if (triggerBranch && triggerBranch[1] === edgeSrcBranch[1]) {
                // Check if trigger branch and edge src branch regex match
                if (triggerBranch[2].match(edgeSrcBranch[2])) {
                    if (config.trigger.startsWith('~pr')) {
                        jobs.add(`PR-${config.prNum}:${edge.dest}`);
                    } else {
                        jobs.add(edge.dest);
                    }
                }
            }
        } else if (edge.src === config.trigger) {
            // Make PR jobs PR-$num:$cloneJob (not sure how to better handle multiple PR jobs)
            if (config.trigger === '~pr' || config.trigger.startsWith('~pr:')) {
                jobs.add(`PR-${config.prNum}:${edge.dest}`);
            } else {
                jobs.add(edge.dest);
            }
            // chainPRTrigger[1] must be 'PR-$num' if matches regexp
        } else if (
            config.chainPR &&
            chainPRTrigger &&
            config.trigger === `${chainPRTrigger[1]}:${edge.src}` &&
            !EXTERNAL_TRIGGER_ALL.test(edge.dest)
        ) {
            jobs.add(`${chainPRTrigger[1]}:${edge.dest}`);
        }
    });

    return Array.from(jobs);
};

module.exports = getNextJobs;
