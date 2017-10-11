'use strict';

/**
 * Get the list of nodes for the graph
 * @method calculateNodes
 * @param  {Object}       jobs Hash of job configs
 * @return {Array}             List of nodes (jobs)
 */
const calculateNodes = (jobs) => {
    const nodes = [
        { name: '~pr' },
        { name: '~commit' }
    ];

    Object.keys(jobs).forEach((name) => {
        nodes.push({ name });
    });

    return nodes;
};

/**
 * Get all the edges of the directed graph from a legacy workflow config
 * @method calculateLegacyEdges
 * @param  {Array}             workflow  List of all jobs in the workflow excluding "main"
 * @return {Array}                       List of edge objects { src, dest }
 */
const calculateLegacyEdges = (workflow) => {
    // In legacy-mode "main" is always required to exist, and be the target of commit and pr
    const edges = [
        { src: '~pr', dest: 'main' },
        { src: '~commit', dest: 'main' }
    ];

    // Legacy-mode workflows are always linear, starting with main
    let src = 'main';

    workflow.forEach((dest) => {
        edges.push({ src, dest });
        src = dest;
    });

    return edges;
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
            const specialTriggers = job.requires.filter(name => name.charAt(0) === '~');
            const normalTriggers = job.requires.filter(name => name.charAt(0) !== '~');
            const isJoin = normalTriggers.length > 1;

            specialTriggers.forEach((src) => {
                edges.push({ src, dest });
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
 * @param  {Array}     [pipelineConfig.workflow]      Legacy workflow config
 * @param  {Object}    [config]                 configuration object
 * @param  {Boolean}   [config.useLegacy]       Flag to process legacy workflows
 * @return {Object}                             List of nodes and edges { nodes, edges }
 */
const getWorkflow = (pipelineConfig, config = { useLegacy: false }) => {
    const jobConfig = pipelineConfig.jobs;
    let edges = [];

    if (!jobConfig) {
        throw new Error('No Job config provided');
    }

    const hasRequiresConfig = Object.keys(jobConfig)
        .some(j => Array.isArray(jobConfig[j].requires));

    if (config.useLegacy && !hasRequiresConfig) {
        // Work out whether there is a user defined workflow,
        // or if we use the order of jobs defined in jobConfig
        let workflow = Array.isArray(pipelineConfig.workflow) ?
            pipelineConfig.workflow :
            Object.keys(jobConfig);

        // remove main since that is a hard dependency in legacy workflows
        // main is already accounted for in calculateLegacyEdges
        workflow = workflow.filter(j => j !== 'main');

        edges = calculateLegacyEdges(workflow);
    } else {
        edges = calculateEdges(jobConfig);
    }

    return { nodes: calculateNodes(jobConfig), edges };
};

module.exports = getWorkflow;
