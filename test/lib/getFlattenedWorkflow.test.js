'use strict';

const { assert } = require('chai');
const getFlattenedWorkflow = require('../../lib/getFlattenedWorkflow');

describe('getFlattenedWorkflow', () => {
    it('should return flattened workflow with stage info', () => {
        const workflow = {
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'foo' },
                { name: 'A' },
                { name: 'B' },
                { name: '~stage@other' },
                { name: '~stage@deploy' },
                { name: '~stage@test' }
            ],
            edges: [
                { src: '~commit', dest: 'foo' },
                { src: 'foo', dest: 'A' },
                { src: 'stage@other', dest: 'B', join: true },
                { src: 'foo', dest: 'B', join: true },
                { src: 'A', dest: 'stage@deploy' },
                { src: 'foo', dest: 'stage@test' }
            ]
        };
        const stageWorkflows = {
            other: {
                nodes: [
                    { name: 'stage@other:teardown' },
                    { name: 'main' },
                    { name: 'stage@other:setup' },
                    { name: 'publish' }
                ],
                edges: [
                    { src: 'stage@other:setup', dest: 'main' },
                    { src: 'main', dest: 'publish' }
                ]
            },
            deploy: {
                nodes: [
                    { name: 'C' },
                    { name: 'stage@deploy:setup' },
                    { name: 'D' },
                    { name: 'stage@deploy:teardown' }
                ],
                edges: [
                    { src: 'stage@deploy:setup', dest: 'C' },
                    { src: 'C', dest: 'D' }
                ]
            },
            test: {
                nodes: [{ name: 'E' }, { name: 'stage@test:setup' }, { name: 'stage@test:teardown' }],
                edges: [{ src: 'stage@test:setup', dest: 'E' }]
            }
        };
        const expectedFlattenedWorkflow = {
            edges: [
                { src: '~commit', dest: 'foo' },
                { src: 'foo', dest: 'A' },
                { src: 'stage@other:teardown', dest: 'B', join: true },
                { src: 'foo', dest: 'B', join: true },
                { src: 'A', dest: 'stage@deploy:setup' },
                { src: 'foo', dest: 'stage@test:setup' },
                { src: 'stage@other:setup', dest: 'main' },
                { src: 'main', dest: 'publish' },
                { src: 'stage@deploy:setup', dest: 'C' },
                { src: 'C', dest: 'D' },
                { src: 'stage@test:setup', dest: 'E' }
            ],
            nodes: [
                { name: '~pr' },
                { name: '~commit' },
                { name: 'foo' },
                { name: 'A' },
                { name: 'B' },
                { name: 'stage@other:teardown' },
                { name: 'main' },
                { name: 'stage@other:setup' },
                { name: 'publish' },
                { name: 'C' },
                { name: 'stage@deploy:setup' },
                { name: 'D' },
                { name: 'stage@deploy:teardown' },
                { name: 'E' },
                { name: 'stage@test:setup' },
                { name: 'stage@test:teardown' }
            ]
        };

        assert.deepEqual(getFlattenedWorkflow(workflow, stageWorkflows), expectedFlattenedWorkflow);
    });

    it('should return workflow with no stage info', () => {
        const workflow = {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo' }, { name: 'A' }, { name: 'B' }],
            edges: [
                { src: '~commit', dest: 'foo' },
                { src: 'foo', dest: 'A' },
                { src: 'foo', dest: 'B' }
            ]
        };
        const stageWorkflows = {};
        const expectedFlattenedWorkflow = {
            edges: [
                { src: '~commit', dest: 'foo' },
                { src: 'foo', dest: 'A' },
                { src: 'foo', dest: 'B' }
            ],
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'foo' }, { name: 'A' }, { name: 'B' }]
        };

        assert.deepEqual(getFlattenedWorkflow(workflow, stageWorkflows), expectedFlattenedWorkflow);
    });
});
