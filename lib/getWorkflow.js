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
 * Build external nodes for its downstream jobs, DFS to traverse its children
 * @method buildExternalNodes
 * @param  {String}         root           Source name. ex `sd@123:main`
 * @param  {Array}          children       Array of downstream jobs. ex: [sd@456:test, sd@789:test]
 * @param  {Set}            nodes          List of graph nodes
 * @param  {TriggerFactory} triggerFactory triggerFactory to figure out its downstream jobs
 * @return {Promise}  List of graph nodes
 */
const buildExternalNodes = async (root, children, nodes, triggerFactory) => {
    await Promise.all(children.map(async (dest) => {
        nodes.add(dest);

        const newRoot = dest;
        const newChildren = await triggerFactory.getDestFromSrc(newRoot);

        await buildExternalNodes(newRoot, newChildren, nodes, triggerFactory);
    }));
};

/**
 * Get the list of nodes for the graph
 * @method calculateNodes
 * @param  {Object}          jobs           Hash of job configs
 * @param  {TriggerFactory}  triggerFactory Trigger Factory to find external triggers
 * @param  {Number}          pipelineId     Id of the current pipeline
 * @return {Array}           List of nodes (jobs)
 */
const calculateNodes = async (jobs, triggerFactory, pipelineId) => {
    const nodes = new Set(['~pr', '~commit']);

    // for backward compatibility. TODO: remove this block later
    if (!triggerFactory) {
        Object.keys(jobs).forEach((name) => {
            nodes.add(name);
            if (Array.isArray(jobs[name].requires)) {
                jobs[name].requires.forEach(n => nodes.add(filterNodeName(n)));
            }
        });

        return [...nodes].map(name => ({ name }));
    }

    // new implementation. allow external join
    await Promise.all(Object.keys(jobs).map(async (jobName) => {
        nodes.add(jobName);

        // upstream nodes
        if (Array.isArray(jobs[jobName].requires)) {
            jobs[jobName].requires.forEach(n => nodes.add(filterNodeName(n)));
        }

        // downstream nodes
        const srcName = `sd@${pipelineId}:${jobName}`;

        // Calculate which downstream jobs are triggered BY current job
        // Only need to take care of external triggers, since internal will be taken care automatically
        const externalDownstreamOr = await triggerFactory.getDestFromSrc(`~${srcName}`);
        const externalDownstreamAnd = await triggerFactory.getDestFromSrc(srcName);

        externalDownstreamOr.forEach((dest) => {
            nodes.add(dest);
        });

        await buildExternalNodes(
            jobName, externalDownstreamAnd, nodes, triggerFactory);
    }));

    return [...nodes].map(name => ({ name }));
};

/**
 * Build external edges for its downstream jobs, DFS to traverse its children
 * @method buildExternalEdges
 * @param  {String}         root           Source name. ex `sd@123:main`
 * @param  {Array}          children       Array of downstream jobs. ex: [sd@456:test, sd@789:test]
 * @param  {Array}          edges          List of graph edges { src, dest }
 * @param  {TriggerFactory} triggerFactory triggerFactory to figure out its downstream jobs
 * @return {Promise}  List of graph edges { src, dest }
 */
const buildExternalEdges = async (root, children, edges, triggerFactory) => {
    await Promise.all(children.map(async (dest) => {
        edges.push({ src: root, dest });

        const newRoot = dest;
        const newChildren = await triggerFactory.getDestFromSrc(newRoot);

        await buildExternalEdges(newRoot, newChildren, edges, triggerFactory);
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

    // for backward compatibility. TODO: remove this block later
    if (!triggerFactory) {
        Object.keys(jobs).forEach((j) => {
            const job = jobs[j];
            const dest = j;

            if (Array.isArray(job.requires)) {
                const specialTriggers = new Set(
                    job.requires.filter(name => name.charAt(0) === '~'));
                const normalTriggers = new Set(
                    job.requires.filter(name => name.charAt(0) !== '~'));
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
    }

    // new implementation. allow external join
    await Promise.all(Object.keys(jobs).map(async (jobName) => {
        const job = jobs[jobName];

        if (Array.isArray(job.requires)) {
            // Calculate which upstream jobs trigger the current job
            const upstreamOr = new Set(
                job.requires.filter(name => name.charAt(0) === '~'));
            const upstreamAnd = new Set(
                job.requires.filter(name => name.charAt(0) !== '~'));
            const isJoin = upstreamAnd.size > 1;

            upstreamOr.forEach((src) => {
                edges.push({ src: filterNodeName(src), dest: jobName });
            });
            upstreamAnd.forEach((src) => {
                const obj = { src, dest: jobName };

                if (isJoin) {
                    obj.join = true;
                }
                edges.push(obj);
            });
        }

        const srcName = `sd@${pipelineId}:${jobName}`;

        // Calculate which downstream jobs are triggered BY current job
        // Only need to take care of external triggers, since internal will be taken care automatically

        const externalDownstreamOr = await triggerFactory.getDestFromSrc(`~${srcName}`);
        const externalDownstreamAnd = await triggerFactory.getDestFromSrc(srcName);

        externalDownstreamOr.forEach((dest) => {
            edges.push({ src: jobName, dest });
        });

        await buildExternalEdges(
            jobName, externalDownstreamAnd, edges, triggerFactory);
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
