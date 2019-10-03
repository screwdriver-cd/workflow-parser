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
 * @param  {Object}          jobs Hash of job configs
 * @param  {TriggerFactory}  triggerFactory Trigger Factory to find external triggers
 * @return {Array}           List of nodes (jobs)
 */
const calculateNodes = (jobs, triggerFactory) => {
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
 * Calculate edges of directed graph based on "requires" property of jobs
 * @method calculateEdges
 * @param  {Object}         jobs           Hash of job configurations
 * @param  {TriggerFactory} triggerFactory Trigger Factory to find external triggers
 * @param  {Number}         pipelineId     Id of the current pipeline
 * @return {Array}          List of graph edges { src, dest }
 */
const calculateEdges = (jobs, triggerFactory, pipelineId) => {
    console.log(triggerFactory);
    const edges = [];

    Object.keys(jobs).forEach((j) => {
        const job = jobs[j];
        const dest = job;

        if (Array.isArray(job.requires)) {
            const isInternal = !name.startsWith('sd@') && !name.startsWith('~sd@');
            const internalOrTriggers = new Set(job.requires.filter(name => isInternal && name.charAt(0) === '~'));
            const internalAndTriggers = new Set(job.requires.filter(name => isInternal && name.charAt(0) !== '~'));

            const srcName = `sd@${pipelineId}:${job}`;
            const externalOrTriggers = await triggerFactory.getDestFromSrc(`~${srcName}`);
            const externalAndTriggers = await triggerFactory.getDestFromSrc(srcName);

            const isInternalJoin = internalAndTriggers.size > 1;
            const isExternalJoin = externalAndTriggers.size > 1;
            const isMixedJoin = isInternalJoin && isExternalJoin;

            internalOrTriggers.forEach((src) => {
                edges.push({ src: filterNodeName(src), dest });
            });

            internalAndTriggers.forEach((src) => {
                const obj = { src, dest };

                if (isInternalJoin || isMixedJoin) {
                    obj.join = true;
                }

                edges.push(obj);
            });

            externalAndTriggers.forEach((dest) => {
                const obj = { src: job, dest };

                if (!dest.startsWith('~')) {
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
 * @param  {Object}    pipelineConfig           A Pipeline Config
 * @param  {Object}    pipelineConfig.jobs      Hash of job configs
 * @param  {TriggerFactory} triggerFactory      Trigger Factory to find external triggers
 * @param  {Number}    pipelineId               Id of the current pipeline
 * @return {Object}                             List of nodes and edges { nodes, edges }
 */
const getWorkflow = (pipelineConfig, triggerFactory, pipelineId) => {
    const jobConfig = pipelineConfig.jobs;

    if (!jobConfig) {
        throw new Error('No Job config provided');
    }
    const edges = calculateEdges(jobConfig, triggerFactory, pipelineId);
    const nodes = calculateNodes(jobConfig, triggerFactory, pipelineId);

    return { nodes, edges };
};

module.exports = getWorkflow;
