'use strict';

const STAGE_PREFIX = /^(?:~)?(stage@)/;
/**
 * Flatten workflowGraphs (event and stage)
 * @method flattenWorkflow
 * @param  {Object}  workflowGraph  Graph representation of workflow
 * @return {Boolean}                True if a cycle exists anywhere in the workflow
 */
const getFlattenedWorkflow = (workflowGraph, stageWorkflows) => {
    const flattenedWorkflow = { edges: [], nodes: [] };

    console.log('----workflowGraph: ', workflowGraph);
    console.log('----stageWorkflows: ', stageWorkflows);

    // Traverse edges, if src is stage, insert teardown prefix
    // if dest is stage, insert setup prefix
    workflowGraph.edges.forEach(edge => {
        let { src, dest } = edge;

        if (STAGE_PREFIX.test(edge.src)) {
            src = `${edge.src}:teardown`;
        }
        if (STAGE_PREFIX.test(edge.dest)) {
            dest = `${edge.dest}:setup`;
        }

        const newEdge = { src, dest };

        if (edge.join) {
            newEdge.join = edge.join;
        }

        flattenedWorkflow.edges.push(newEdge);
    });
    // Remove stage nodes
    flattenedWorkflow.nodes = workflowGraph.nodes.filter(node => !STAGE_PREFIX.test(node.name));

    // Concat all edges, nodes
    Object.values(stageWorkflows).forEach(stage => {
        console.log('----stage: ', stage);

        flattenedWorkflow.edges = flattenedWorkflow.edges.concat(stage.edges);
        flattenedWorkflow.nodes = flattenedWorkflow.nodes.concat(stage.nodes);
    });

    return flattenedWorkflow;
};

module.exports = getFlattenedWorkflow;
