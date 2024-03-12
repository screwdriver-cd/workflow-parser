'use strict';

const hoek = require('@hapi/hoek');

/**
 * Remove the ~ prefix for logical OR on select node names.
 * @method filterNodeName
 * @param  {String}       name A Node Name, e.g. foo, ~foo, ~pr, ~commit, ~release, ~tag, ~sd@1234:foo
 * @return {String}            A filtered node name, e.g. foo, foo, ~pr, ~commit, ~release, ~tag, ~sd@1234:foo
 */
const filterNodeName = name => (/^~((pr|commit|release|tag)(?:$|:)|(sd@))/.test(name) ? name : name.replace('~', ''));

/**
 * Build external nodes for its downstream jobs, DFS to traverse its children
 * @method buildExternalNodes
 * @param  {Array}          children       Array of downstream jobs. ex: [sd@456:test, sd@789:test]
 * @param  {Set}            nodes          List of graph nodes
 * @param  {TriggerFactory} triggerFactory triggerFactory to figure out its downstream jobs
 * @return {Promise}  List of graph nodes
 */
const buildExternalNodes = async (children, nodes, triggerFactory) => {
    await Promise.all(
        children.map(async dest => {
            nodes.add(dest.replace('~sd@', 'sd@'));

            const newChildren = await triggerFactory.getDestFromSrc(dest);

            await buildExternalNodes(newChildren, nodes, triggerFactory);
        })
    );
};

/**
 * Get the list of nodes for the graph
 * @method calculateNodes
 * @param  {Object}          jobs                   Hash of job configs
 * @param  {TriggerFactory}  triggerFactory         Trigger Factory to find external triggers
 * @param  {Object}          externalDownstreamOrs  Hash of externalDownstreamOr. ex: {jobName: externalDownstreamOr}
 * @param  {Object}          externalDownstreamAnds Hash of externalDownstreamAnd. ex {jobName: externalDownstreamAnd}
 * @return {Array}           List of nodes (jobs)
 */
const calculateNodes = async (jobs, triggerFactory, externalDownstreamOrs, externalDownstreamAnds) => {
    const nodes = new Set(['~pr', '~commit']);
    const jobNameToStageNameMap = {};

    // for backward compatibility. TODO: remove this block later
    if (!triggerFactory) {
        Object.keys(jobs).forEach(name => {
            nodes.add(name);
            const stageObj = jobs[name].stage;

            if (stageObj) {
                jobNameToStageNameMap[name] = stageObj.name;
            }

            if (Array.isArray(jobs[name].requires)) {
                jobs[name].requires.forEach(n => nodes.add(filterNodeName(n)));
            }
        });
    } else {
        // new implementation. allow external join
        await Promise.all(
            Object.keys(jobs).map(async jobName => {
                nodes.add(jobName);
                const stageObj = jobs[jobName].stage;

                if (stageObj) {
                    jobNameToStageNameMap[jobName] = stageObj.name;
                }

                // upstream nodes
                if (Array.isArray(jobs[jobName].requires)) {
                    jobs[jobName].requires.forEach(n => nodes.add(filterNodeName(n)));
                }

                // downstream nodes
                const externalDownstreamOr = jobName in externalDownstreamOrs ? externalDownstreamOrs[jobName] : [];
                const externalDownstreamAnd = jobName in externalDownstreamAnds ? externalDownstreamAnds[jobName] : [];

                externalDownstreamOr.forEach(dest => {
                    nodes.add(dest.replace('~sd@', 'sd@'));
                });

                await buildExternalNodes(externalDownstreamAnd, nodes, triggerFactory);
            })
        );
    }

    const annotations = [
        { annotation: 'annotations>screwdriver.cd/displayName', fieldName: 'displayName', default: undefined },
        { annotation: 'annotations>screwdriver.cd/virtualJob', fieldName: 'virtual', default: undefined }
    ];

    return [...nodes].map(name => {
        const m = { name };

        annotations.forEach(({ annotation, fieldName, defaultValue }) => {
            const fieldValue = hoek.reach(jobs[name], annotation, {
                separator: '>',
                default: defaultValue
            });

            if (fieldValue !== undefined) {
                m[fieldName] = fieldValue;
            }
        });

        const stageName = jobNameToStageNameMap[name];

        if (stageName) {
            m.stageName = stageName;
        }

        return m;
    });
};

/**
 * Build external edges for its downstream jobs, DFS to traverse its children
 * @method buildExternalEdges
 * @param  {String}         root           Source name. (e.g. main or sd@111:main)
 * @param  {Array}          children       Array of downstream jobs. (e.g.: [sd@456:test, sd@789:test])
 * @param  {Array}          edges          List of graph edges in the form { src, dest }
 * @param  {TriggerFactory} triggerFactory triggerFactory to figure out its downstream jobs
 * @return {Promise}  List of graph edges { src, dest }
 */
const buildExternalEdges = async (root, children, edges, triggerFactory) => {
    await Promise.all(
        children.map(async dest => {
            edges.push({ src: root, dest: dest.replace('~sd@', 'sd@') });

            const newChildren = await triggerFactory.getDestFromSrc(dest);

            await buildExternalEdges(dest, newChildren, edges, triggerFactory);
        })
    );
};

/**
 * Calculate edges of directed graph based on "requires" property of jobs
 * @method calculateEdges
 * @param  {Object}         jobs                   Hash of job configurations
 * @param  {TriggerFactory} triggerFactory         Trigger Factory to find external triggers
 * @param  {Object}         externalDownstreamOrs  Hash of externalDownstreamOr. ex: {jobName: externalDownstreamOr}
 * @param  {Object}         externalDownstreamAnds Hash of externalDownstreamAnd. ex {jobName: externalDownstreamAnd}
 * @return {Array}          List of graph edges { src, dest }
 */
const calculateEdges = async (jobs, triggerFactory, externalDownstreamOrs, externalDownstreamAnds) => {
    const edges = [];

    // for backward compatibility. TODO: remove this block later
    if (!triggerFactory) {
        Object.keys(jobs).forEach(j => {
            let { requires } = jobs[j];
            const dest = j;

            // For plain text format 'requires: foo'
            if (!Array.isArray(requires)) {
                requires = requires ? [requires] : [];
            }

            const specialTriggers = new Set(requires.filter(name => name.charAt(0) === '~'));
            const normalTriggers = new Set(requires.filter(name => name.charAt(0) !== '~'));
            const isJoin = normalTriggers.size >= 1;

            specialTriggers.forEach(src => {
                edges.push({ src: filterNodeName(src), dest });
            });

            normalTriggers.forEach(src => {
                const obj = { src, dest };

                if (isJoin) {
                    obj.join = true;
                }

                edges.push(obj);
            });
        });

        return edges;
    }

    // new implementation. allow external join
    await Promise.all(
        Object.keys(jobs).map(async jobName => {
            let { requires } = jobs[jobName];

            // For plain text format 'requires: foo'
            if (!Array.isArray(requires)) {
                requires = requires ? [requires] : [];
            }

            // Calculate which upstream jobs trigger the current job
            const upstreamOr = new Set(requires.filter(name => name.charAt(0) === '~'));
            const upstreamAnd = new Set(requires.filter(name => name.charAt(0) !== '~'));
            const isJoin = upstreamAnd.size >= 1;

            upstreamOr.forEach(src => {
                edges.push({ src: filterNodeName(src), dest: jobName });
            });
            upstreamAnd.forEach(src => {
                const obj = { src, dest: jobName };

                if (isJoin) {
                    obj.join = true;
                }
                edges.push(obj);
            });

            const externalDownstreamOr = jobName in externalDownstreamOrs ? externalDownstreamOrs[jobName] : [];
            const externalDownstreamAnd = jobName in externalDownstreamAnds ? externalDownstreamAnds[jobName] : [];

            externalDownstreamOr.forEach(dest => {
                edges.push({ src: jobName, dest: dest.replace('~sd@', 'sd@') });
            });

            // Handle join case
            await buildExternalEdges(jobName, externalDownstreamAnd, edges, triggerFactory);
        })
    );

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
    const externalDownstreamOrs = {};
    const externalDownstreamAnds = {};

    if (!jobConfig) {
        throw new Error('No Job config provided');
    }

    // Consolidate necessary items for calculateNodes() and calculateEdges()
    if (triggerFactory) {
        await Promise.all(
            Object.keys(jobConfig).map(async jobName => {
                const srcName = `sd@${pipelineId}:${jobName}`;

                // Calculate which downstream jobs are triggered BY current job
                // Only need to take care of external triggers, since internal will be taken care automatically
                externalDownstreamOrs[jobName] = await triggerFactory.getDestFromSrc(`~${srcName}`);
                externalDownstreamAnds[jobName] = await triggerFactory.getDestFromSrc(srcName);
            })
        );
    }

    const nodes = await calculateNodes(jobConfig, triggerFactory, externalDownstreamOrs, externalDownstreamAnds);
    const edges = await calculateEdges(jobConfig, triggerFactory, externalDownstreamOrs, externalDownstreamAnds);

    return { nodes, edges };
};

module.exports = getWorkflow;
