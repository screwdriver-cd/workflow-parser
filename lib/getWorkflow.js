'use strict';

/**
 * Remove the ~ prefix for logical OR on select node names.
 * @method filterNodeName
 * @param  {String}       name A Node Name, e.g. foo, ~foo, ~pr, ~commit, ~release, ~tag, ~sd@1234:foo
 * @return {String}            A filtered node name, e.g. foo, foo, ~pr, ~commit, ~release, ~tag, ~sd@1234:foo
 */
const filterNodeName = name =>
    (/^~(pr|commit|release|tag|sd@)/.test(name) ? name : name.replace('~', ''));

/**
 * Get the list of nodes for the graph
 * @method calculateNodes
 * @param  {Object}          jobs           Hash of job configs
 * @param  {TriggerFactory}  triggerFactory Trigger Factory to find external triggers
 * @param  {Number}          pipelineId     Id of the current pipeline
 * @return {Array}           List of nodes (jobs)
 */
const calculateNodes = async (jobs, triggerFactory, pipelineId) => {
    console.log(triggerFactory);
    const nodes = new Set(['~pr', '~commit']);

    Object.keys(jobs).forEach((name) => {
        nodes.add(name);
        if (Array.isArray(jobs[name].requires)) {
            jobs[name].requires.forEach(n => nodes.add(filterNodeName(n)));
        }
    });

    return [...nodes].map(name => ({ name }));
};

/**
 * Build external edges for its downstream jobs, DFS to traverse its children
 * @method buildExternalEdge
 * @param  {String}         root           Source name. ex `sd@123:main`
 * @param  {Array}          children       Array of downstream jobs. ex: [sd@456:test, sd@789:test]
 * @param  {Object}         edges          List of graph edges { src, dest }
 * @param  {TriggerFactory} triggerFactory triggerFactory to figure out its downstream jobs
 * @return {Promise}  List of graph edges { src, dest }
 */
const buildExternalEdge = async (root, children, edges, triggerFactory) => {
    await Promise.all(children.map(async (dest) => {
        edges.push({ src: root, dest });

        const newRoot = dest;
        const newChildren = await triggerFactory.getDestFromSrc(newRoot);

        await buildExternalEdge(newRoot, newChildren, edges, triggerFactory);
    }));
};

/**
 * Calculate edges of directed graph based on "requires" property of jobs
 * @method calculateEdges
 * @param  {Object}         jobs           Hash of job configurations
 * @param  {TriggerFactory} triggerFactory Trigger Factory to find external triggers
 * @param  {Number}         pipelineId     Id of the current pipeline
 * @return {Array}          List of graph edges { src, dest }
 */
const calculateEdges = async (jobs, triggerFactory, pipelineId) => {
    const edges = [];

    await Promise.all(Object.keys(jobs).map(async (jobname) => {
        const job = jobs[jobname];

        if (Array.isArray(job.requires)) {
            // Calculate which upstream jobs trigger the current job
            const upstreamOr = new Set(
                job.requires.filter(name => name.charAt(0) === '~'));
            const upstreamAnd = new Set(
                job.requires.filter(name => name.charAt(0) !== '~'));
            const isJoin = upstreamAnd.size > 1;

            upstreamOr.forEach((src) => {
                edges.push({ src: filterNodeName(src), dest: jobname });
            });
            upstreamAnd.forEach((src) => {
                const obj = { src, dest: jobname };

                if (isJoin) {
                    obj.join = true;
                }
                edges.push(obj);
            });
        }

        // for backward compatibility
        if (triggerFactory) {
            const srcName = `sd@${pipelineId}:${jobname}`;

            // Calculate which downstream jobs are triggered BY current job
            // Only need to take care of external triggers, since internal will be taken care automatically

            const externalDownstreamOr = await triggerFactory.getDestFromSrc(`~${srcName}`);
            const externalDownstreamAnd = await triggerFactory.getDestFromSrc(srcName);

            externalDownstreamOr.forEach((dest) => {
                edges.push({ src: jobname, dest });
            });

            await buildExternalEdge(
                jobname, externalDownstreamAnd, edges, triggerFactory);
        }
    }));

    return edges;
};

/**
 * Given a pipeline config, return a directed graph configuration that describes the workflow
 * @method getWorkflow
 * @param  {Object}         pipelineConfig          A Pipeline Config
 * @param  {Object}         pipelineConfig.jobs     Hash of job configs
 * @param  {TriggerFactory} triggerFactory          Trigger Factory to find external triggers
 * @param  {Number}         pipelineId              Id of the current pipeline
 * @return {Object}         List of nodes and edges {nodes, edges}
 */
const getWorkflow = async (pipelineConfig, triggerFactory, pipelineId) => {
    const jobConfig = pipelineConfig.jobs;

    if (!jobConfig) {
        throw new Error('No Job config provided');
    }
    const nodes = await calculateNodes(jobConfig, triggerFactory, pipelineId);
    const edges = await calculateEdges(jobConfig, triggerFactory, pipelineId);

    return { nodes, edges };
};

module.exports = getWorkflow;
