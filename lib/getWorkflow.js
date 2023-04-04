'use strict';

const hoek = require('@hapi/hoek');

/**
 * Remove the ~ prefix for logical OR on select node names.
 * @method filterNodeName
 * @param  {String}       name A Node Name, e.g. foo, ~foo, ~pr, ~commit, ~release, ~tag, ~sd@1234:foo
 * @return {String}            A filtered node name, e.g. foo, foo, ~pr, ~commit, ~release, ~tag, ~sd@1234:foo
 */
const filterNodeName = name =>
    /^~((pr|commit|release|tag|stage@)(?:$|:)|(sd@))/.test(name) ? name : name.replace('~', '');

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
 * Add display name to node
 * @param  {Array}  jobs                  Array of jobs
 * @param  {String} jobName               Job name
 * @param  {Object} node                  Node object
 */
const handleDisplayName = (jobs, jobName, node) => {
    // Add display name
    const displayName = hoek.reach(jobs[jobName], 'annotations>screwdriver.cd/displayName', {
        separator: '>',
        default: undefined
    });

    if (displayName !== undefined) {
        node.displayName = displayName;
    }
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

    // for backward compatibility. TODO: remove this block later
    if (!triggerFactory) {
        Object.keys(jobs).forEach(name => {
            nodes.add(name);
            if (Array.isArray(jobs[name].requires)) {
                jobs[name].requires.forEach(n => nodes.add(filterNodeName(n)));
            }
        });

        return [...nodes].map(name => ({ name }));
    }

    let stagesDict = [];

    // new implementation. allow external join
    await Promise.all(
        Object.keys(jobs).map(async jobName => {
            const stageObj = jobs[jobName].stage;
            const stageNode = { name: jobName };

            // Add display name
            handleDisplayName(jobs, jobName, stageNode);

            // Stage node
            if (stageObj) {
                if (stagesDict[stageObj.name]) {
                    stagesDict[stageObj.name].push(stageNode);
                } else {
                    const newStageObj = { [stageObj.name]: [stageNode] };

                    stagesDict = { ...stagesDict, ...newStageObj };
                }
            } else {
                nodes.add(jobName);
            }

            // upstream nodes
            if (Array.isArray(jobs[jobName].requires)) {
                jobs[jobName].requires.forEach(n => {
                    // Stage node
                    if (/^(?:~)?(stage@)/.test(n)) {
                        const [, stageName] = n.match(/^(?:~)?stage@([\w-]+)(?::([\w-]+))?$/);

                        if (stageName && stagesDict[stageName]) {
                            stagesDict[stageName].push({ name: filterNodeName(n) });
                        } else {
                            const newStageObj = { [stageName]: [{ name: filterNodeName(n) }] };

                            stagesDict = { ...stagesDict, ...newStageObj };
                        }
                    } else if (!jobs[filterNodeName(n)] || !jobs[filterNodeName(n)].stage) {
                        nodes.add(filterNodeName(n));
                    }
                });
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

    // Create stage nodes
    Object.keys(stagesDict).forEach(stage => {
        nodes.add(`~stage@${stage}`);
    });

    const nodeObjects = [...nodes].map(name => {
        const m = { name };

        // Add display name
        handleDisplayName(jobs, name, m);

        return m;
    });

    return { nodes: nodeObjects, stageNodes: stagesDict };
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
const calculateEdges = async (jobs, triggerFactory, externalDownstreamOrs, externalDownstreamAnds, stageConfig) => {
    const edges = [];
    let stagesDict = [];

    // for backward compatibility. TODO: remove this block later
    if (!triggerFactory) {
        Object.keys(jobs).forEach(j => {
            const job = jobs[j];
            const dest = j;

            if (Array.isArray(job.requires)) {
                const specialTriggers = new Set(job.requires.filter(name => name.charAt(0) === '~'));
                const normalTriggers = new Set(job.requires.filter(name => name.charAt(0) !== '~'));
                const isJoin = normalTriggers.size > 1;

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
            }
        });

        return edges;
    }

    // new implementation. allow external join
    await Promise.all(
        Object.keys(jobs).map(async jobName => {
            const job = jobs[jobName];
            const stageObj = job.stage;

            if (Array.isArray(job.requires)) {
                // Calculate which upstream jobs trigger the current job
                const upstreamOr = new Set(job.requires.filter(name => name.charAt(0) === '~'));
                const upstreamAnd = new Set(job.requires.filter(name => name.charAt(0) !== '~'));
                const isJoin = upstreamAnd.size > 1;

                upstreamOr.forEach(src => {
                    const [source] = src.split(':');

                    // Skip adding edge when src is stage setup
                    if (stageObj) {
                        if (!stageObj.startFrom) {
                            const stageEdge = { src: filterNodeName(source), dest: jobName };

                            if (stagesDict[stageObj.name]) {
                                stagesDict[stageObj.name].push(stageEdge);
                            } else {
                                const newStageObj = { [stageObj.name]: [stageEdge] };

                                stagesDict = { ...stagesDict, ...newStageObj };
                            }
                        }
                    } else {
                        edges.push({
                            src: src.startsWith('~stage@') ? filterNodeName(source) : filterNodeName(src),
                            dest: jobName
                        });
                    }
                });
                upstreamAnd.forEach(src => {
                    const obj = { src, dest: jobName };

                    if (isJoin) {
                        obj.join = true;
                    }

                    // Skip adding edge when src is stage setup
                    if (stageObj) {
                        if (!stageObj.startFrom) {
                            const stageEdge = obj;

                            if (stagesDict[stageObj.name]) {
                                stagesDict[stageObj.name].push(stageEdge);
                            } else {
                                const newStageObj = { [stageObj.name]: [stageEdge] };

                                stagesDict = { ...stagesDict, ...newStageObj };
                            }
                        }
                    } else {
                        edges.push(obj);
                    }
                });
            }

            const externalDownstreamOr = jobName in externalDownstreamOrs ? externalDownstreamOrs[jobName] : [];
            const externalDownstreamAnd = jobName in externalDownstreamAnds ? externalDownstreamAnds[jobName] : [];

            externalDownstreamOr.forEach(dest => {
                edges.push({ src: jobName, dest: dest.replace('~sd@', 'sd@') });
            });

            // Handle join case
            await buildExternalEdges(jobName, externalDownstreamAnd, edges, triggerFactory);
        })
    );

    // Handle stage requires
    if (stageConfig) {
        Object.keys(stageConfig).forEach(stage => {
            if (Array.isArray(stageConfig[stage].requires)) {
                stageConfig[stage].requires.forEach(upstream => {
                    edges.push({ src: upstream, dest: `stage@${stage}` });
                });
            } else if (stageConfig[stage].requires) {
                edges.push({ src: stageConfig[stage].requires, dest: `stage@${stage}` });
            }
        });
    }

    return { edges, stageEdges: stagesDict };
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
const getWorkflow = async ({ pipelineConfig, triggerFactory, pipelineId, pipelineOnly = true }) => {
    const { jobs: jobConfig, stages: stageConfig } = pipelineConfig;
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

    const { nodes: newNodes, stageNodes } = await calculateNodes(
        jobConfig,
        triggerFactory,
        externalDownstreamOrs,
        externalDownstreamAnds
    );
    const { edges: newEdges, stageEdges } = await calculateEdges(
        jobConfig,
        triggerFactory,
        externalDownstreamOrs,
        externalDownstreamAnds,
        stageConfig
    );

    // Handle stage triggers
    // Remove stage-specific jobs from main workflowGraph(nodes and edges)
    const stageWorkflows = {};

    if (!pipelineOnly && stageConfig) {
        // Split all stage nodes
        const stageNames = Object.keys(stageConfig);

        stageNames.forEach(stageName => {
            stageWorkflows[stageName] = { nodes: stageNodes[stageName], edges: stageEdges[stageName] };
        });
    }

    if (pipelineOnly) {
        return { nodes: newNodes, edges: newEdges };
    }

    return { workflow: { nodes: newNodes, edges: newEdges }, stageWorkflows };
};

module.exports = getWorkflow;
