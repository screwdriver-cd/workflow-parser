'use strict';

const { assert } = require('chai');
const hasJoin = require('../../lib/hasJoin');

describe('hasJoin', () => {
    it('should return true if a workflow has a join', () => {
        const workflow = {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'A' }, { name: 'B' }, { name: 'C' }],
            edges: [
                { src: '~commit', dest: 'A' }, // start
                { src: 'A', dest: 'C', join: true }, // join
                { src: 'B', dest: 'C', join: true } // join
            ]
        };

        assert.isTrue(hasJoin(workflow));
    });

    it('should return false if workflow has no join', () => {
        const workflow = {
            nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'A' }, { name: 'B' }],
            edges: [
                { src: '~commit', dest: 'A' }, // start
                { src: 'A', dest: 'B' } // end
            ]
        };

        assert.isFalse(hasJoin(workflow));
    });
});
