'use strict';

/**
 * Remove the ~ prefix for logical OR on select node names.
 * @method filterNodeName
 * @param  {String}       name A Node Name, e.g. foo, ~foo, ~pr, ~commit, ~sd@1234:foo
 * @return {String}            A filtered node name, e.g. foo, foo, ~pr, ~commit, ~sd@1234:foo
 */
const filterNodeName = name =>
    (/^~(pr|commit|release|tag|sd@)/.test(name) ? name : name.replace('~', ''));

/**
 * Get the list of nodes for the graph
 * @method calculateNodes
 * @param  {Object}       jobs Hash of job configs
 * @return {Array}             List of nodes (jobs)
 */
const calculateNodes = (jobs) => {
    const nodes = new Set(['~pr', '~commit', '~release', '~tag']);

    Object.keys(jobs).forEach((name) => {
        nodes.add(name);
        if (Array.isArray(jobs[name].requires)) {
            jobs[name].requires.forEach(n => nodes.add(filterNodeName(n)));
        }
    });

    return [...nodes].map(name => ({ name }));
};

/**
 * Calculate edges of directed graph based on "requires" property of jobs
 * @method calculateEdges
 * @param  {Object}       jobs Hash of job configurations
 * @return {Array}             List of graph edges { src, dest }
 */
const calculateEdges = (jobs) => {
    const edges = [];

    Object.keys(jobs).forEach((j) => {
        const job = jobs[j];
        const dest = j;

        if (Array.isArray(job.requires)) {
            const specialTriggers = new Set(job.requires.filter(name => name.charAt(0) === '~'));
            const normalTriggers = new Set(job.requires.filter(name => name.charAt(0) !== '~'));
            const isJoin = normalTriggers.size > 1;

            specialTriggers.forEach((src) => {
                edges.push({ src: filterNodeName(src), dest });
            });

            normalTriggers.forEach((src) => {
                const obj = { src, dest };

                if (isJoin) {
                    obj.join = true;
                }

                edges.push(obj);
            });
        }
    });

    return edges;
};

/**
 * Given a pipeline config, return a directed graph configuration that describes the workflow
 * @method getWorkflow
 * @param  {Object}    pipelineConfig                 A Pipeline Config
 * @param  {Object}    pipelineConfig.jobs            Hash of job configs
 * @return {Object}                             List of nodes and edges { nodes, edges }
 */
const getWorkflow = (pipelineConfig) => {
    const jobConfig = pipelineConfig.jobs;
    let edges = [];

    if (!jobConfig) {
        throw new Error('No Job config provided');
    }

    edges = calculateEdges(jobConfig);

    return { nodes: calculateNodes(jobConfig), edges };
};

module.exports = getWorkflow;
