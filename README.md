# Workflow Parser
[![Version][npm-image]][npm-url] ![Downloads][downloads-image] [![Build Status][status-image]][status-url] [![Open Issues][issues-image]][issues-url] ![License][license-image]

> Parses and converts pipeline configuration into a workflow graph

## Usage

```bash
npm install screwdriver-workflow-parser
```

```
const { getWorkflow, getNextJobs, getSrcForJoin, hasCycle, hasJoin } = require('screwdriver-workflow-parser');

// Calculate the directed graph workflow from a pipeline config (and parse legacy workflows)
const workflowGraph = getWorkflow({ pipelineConfig, triggerFactory });

/* 
{ 
    nodes: [{ name: '~pr'}, { name: '~commit'}, { name: 'main' }], 
    edges: [{ src: '~pr', dest: 'main'}, { src: '~commit', dest: 'main'}] 
}
*/

// Get a list of job names to start as a result of a commit event, e.g. [ 'a', 'b' ]
const commitJobsToTrigger = getNextJobs(workflowGraph, { trigger: '~commit' });

// Get a list of job names to start as a result of a pull-request event, e.g. [ 'PR-123:a' ]
const prJobsToTrigger = getNextJobs(workflowGraph, { trigger: '~pr', prNum: 123 });

// Return the join src jobs given a workflowGraph and dest job
const srcArray = getSrcForJoin(workflowGraph, { jobName: 'foo' });

// Check to see if a given workflow graph has a loop in it. A -> B -> A
if (hasCycle(workflowGraph)) {
    console.error('Graph contains a loop.');
}

// Check if the workflow has a join, e.g. A + B -> C
if (hasJoin(workflowGraph)) {
    console.log('Graph contains join');
}
```

## Testing

```bash
npm test
```

## License

Code licensed under the BSD 3-Clause license. See LICENSE file for terms.

[npm-image]: https://img.shields.io/npm/v/screwdriver-workflow-parser.svg
[npm-url]: https://npmjs.org/package/screwdriver-workflow-parser
[downloads-image]: https://img.shields.io/npm/dt/screwdriver-workflow-parser.svg
[license-image]: https://img.shields.io/npm/l/screwdriver-workflow-parser.svg
[issues-image]: https://img.shields.io/github/issues/screwdriver-cd/workflow-parser.svg
[issues-url]: https://github.com/screwdriver-cd/workflow-parser/issues
[status-image]: https://cd.screwdriver.cd/pipelines/529/badge
[status-url]: https://cd.screwdriver.cd/pipelines/529
