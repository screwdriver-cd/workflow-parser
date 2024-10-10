'use strict';

const { PR_JOB_NAME } = require('screwdriver-data-schema').config.regex;

/**
 * Find the non PR job from given workflowGragh and dest job
 * @method findJob
 * @param  {Object} workflowGraph       Directed graph representation of workflow
 * @param  {String} destJobName         The dest job name to be triggered after a join
 * @return {Set}                        List of node object consists of job name and id
 */
function findJobs(workflowGraph, destJobName) {
    const jobs = new Set();

    workflowGraph.edges.forEach(edge => {
        if (edge.dest === destJobName && edge.join) {
            jobs.add(workflowGraph.nodes.find(node => node.name === edge.src));
        }
    });

    return jobs;
}

/**
 * Find the PR job from given workflowGragh and dest job
 * Given dest job includes `PR-{PR number}:` prefix, so it need to remove prefix at first
 * @method findPRJobs
 * @param  {Object} workflowGraph       Directed graph representation of workflow
 * @param  {String} destJobName         The dest job name to be triggered after a join
 * @return {Set}                        List of node object consists of job name and id
 */
function findPRJobs(workflowGraph, destJobName) {
    const jobs = new Set();
    const [prPrefix, prJobName] = destJobName.split(':');

    workflowGraph.edges.forEach(edge => {
        if (edge.dest === prJobName && edge.join) {
            const findJob = {
                ...workflowGraph.nodes.find(node => node.name === edge.src)
            };

            // need to add `PR-{PR number}:` prefix when returning
            findJob.name = `${prPrefix}:${findJob.name}`;
            jobs.add(findJob);
        }
    });

    return jobs;
}

/**
 * Return if PR job or not
 * PR job name should match regex used in data-schema. e.g. "PR-1:jobName"
 * @method isPR
 * @param  {String}  destJobName       The dest job name which has 'PR-{num}:' prefix
 * @return {Boolean}
 */
function isPR(destJobName) {
    return PR_JOB_NAME.test(destJobName);
}

/**
 * Return the join src jobs
 * @method getJoinJobs
 * @param  {Object} workflowGraph       Directed graph representation of workflow
 * @param  {String} destJobName         The dest job name to be triggered after a join
 * @return {Set}                        List of node object consists of job name and id
 */
function getJoinJobs(workflowGraph, destJobName) {
    if (isPR(destJobName)) {
        return findPRJobs(workflowGraph, destJobName);
    }

    return findJobs(workflowGraph, destJobName);
}

/**
 * Return the join src jobs given a workflowGraph and dest job
 * @method getSrcForJoin
 * @param  {Object}    workflowGraph    Directed graph representation of workflow
 * @param  {Object}    config
 * @param  {String}    config.jobName   The dest job name to be triggered after a join
 * @return {Array}                      List of node object consists of job name and id
 */
const getSrcForJoin = (workflowGraph, config) => {
    if (!config || !config.jobName) {
        throw new Error('Must provide a job name');
    }

    const jobs = getJoinJobs(workflowGraph, config.jobName);

    return Array.from(jobs);
};

module.exports = getSrcForJoin;
