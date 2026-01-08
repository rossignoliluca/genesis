/**
 * Tests for Grounding Module
 *
 * Tests the epistemic stack: science, proof, wisdom, tradition, human, prudence
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Grounding Module', () => {
  describe('Domain Classification', () => {
    test('classifies factual questions', async () => {
      const { classifyDomain } = await import('../src/grounding/index.js');

      assert.strictEqual(classifyDomain('What is TypeScript?'), 'factual');
      assert.strictEqual(classifyDomain('How does React work?'), 'factual');
      assert.strictEqual(classifyDomain('Is it true that water boils at 100C?'), 'factual');
    });

    test('classifies mathematical questions', async () => {
      const { classifyDomain } = await import('../src/grounding/index.js');

      assert.strictEqual(classifyDomain('Prove that sqrt(2) is irrational'), 'mathematical');
      assert.strictEqual(classifyDomain('Calculate the derivative of x^2'), 'mathematical');
      assert.strictEqual(classifyDomain('Is it provable in ZFC?'), 'mathematical');
    });

    test('classifies ethical questions', async () => {
      const { classifyDomain } = await import('../src/grounding/index.js');

      // "should I" pattern
      assert.strictEqual(classifyDomain('should I release this code'), 'ethical');
      assert.strictEqual(classifyDomain('is it right to do this'), 'ethical');
      assert.strictEqual(classifyDomain('what is my moral duty'), 'ethical');
    });

    test('classifies existential questions', async () => {
      const { classifyDomain } = await import('../src/grounding/index.js');

      // "meaning" pattern
      assert.strictEqual(classifyDomain('what is the meaning of life'), 'existential');
      assert.strictEqual(classifyDomain('what is my purpose'), 'existential');
      assert.strictEqual(classifyDomain('does it matter in the end'), 'existential');
    });

    test('classifies aesthetic questions', async () => {
      const { classifyDomain } = await import('../src/grounding/index.js');

      assert.strictEqual(classifyDomain('Is it beautiful?'), 'aesthetic');
      assert.strictEqual(classifyDomain('Which do you prefer?'), 'aesthetic');
    });

    test('defaults to factual for unknown patterns', async () => {
      const { classifyDomain } = await import('../src/grounding/index.js');

      assert.strictEqual(classifyDomain('some random text'), 'factual');
    });
  });

  describe('Authority Mapping', () => {
    test('maps domains to authorities', async () => {
      const { getAuthority } = await import('../src/grounding/index.js');

      assert.deepStrictEqual(getAuthority('factual'), ['science']);
      assert.deepStrictEqual(getAuthority('mathematical'), ['proof']);
      assert.deepStrictEqual(getAuthority('ethical'), ['wisdom', 'human']);
      assert.deepStrictEqual(getAuthority('existential'), ['religion', 'human']);
      assert.deepStrictEqual(getAuthority('aesthetic'), ['human']);
      assert.deepStrictEqual(getAuthority('novel'), ['prudence', 'human']);
    });
  });

  describe('Epistemic Stack', () => {
    test('creates and initializes', async () => {
      const { createEpistemicStack } = await import('../src/grounding/index.js');

      const stack = createEpistemicStack();
      assert.ok(stack, 'Stack should be created');
    });

    test('grounds factual claims (without science connected)', async () => {
      const { createEpistemicStack } = await import('../src/grounding/index.js');

      const stack = createEpistemicStack();
      const claim = await stack.ground('What is TypeScript?');

      assert.strictEqual(claim.domain, 'factual');
      assert.strictEqual(claim.authority, 'science');
      // Without science connected, level is unknown
      assert.strictEqual(claim.level, 'unknown');
    });

    test('grounds ethical claims with wisdom', async () => {
      const { createEpistemicStack } = await import('../src/grounding/index.js');

      const stack = createEpistemicStack();
      const claim = await stack.ground('should I do this');

      assert.strictEqual(claim.domain, 'ethical');
      assert.strictEqual(claim.authority, 'wisdom');
      // Human is last in authority chain, so level ends at preference
      assert.strictEqual(claim.level, 'preference');
      assert.ok(claim.grounding.humanConsultation?.required, 'Should require human');
    });

    test('grounds existential claims with tradition', async () => {
      const { createEpistemicStack } = await import('../src/grounding/index.js');

      const stack = createEpistemicStack();
      const claim = await stack.ground('what is the meaning of life');

      assert.strictEqual(claim.domain, 'existential');
      assert.strictEqual(claim.authority, 'religion');
      // Human is last in authority chain, so level ends at preference
      assert.strictEqual(claim.level, 'preference');
      assert.ok(claim.grounding.humanConsultation?.required, 'Should require human');
    });

    test('generates human questions', async () => {
      const { createEpistemicStack } = await import('../src/grounding/index.js');

      const stack = createEpistemicStack();
      const claim = await stack.ground('Should I release this?');

      const question = stack.getHumanQuestion(claim);
      assert.ok(question, 'Should generate question');
      assert.ok(question.includes('release this'), 'Question should include claim');
    });

    test('incorporates human response', async () => {
      const { createEpistemicStack } = await import('../src/grounding/index.js');

      const stack = createEpistemicStack();
      let claim = await stack.ground('Should I proceed?');

      assert.ok(stack.requiresHuman(claim), 'Should require human');

      claim = stack.incorporateHumanResponse(claim, 'Yes, proceed');

      assert.strictEqual(claim.grounding.humanConsultation?.response, 'Yes, proceed');
      assert.strictEqual(claim.level, 'preference');
      assert.ok(claim.confidence > 0.8, 'Confidence should be high after human');
    });
  });

  describe('Wisdom Repository', () => {
    test('contains wisdom sources', async () => {
      const { WISDOM_REPOSITORY } = await import('../src/grounding/index.js');

      assert.ok(WISDOM_REPOSITORY.length > 0, 'Should have wisdom');

      // Check structure
      const wisdom = WISDOM_REPOSITORY[0];
      assert.ok(wisdom.type, 'Should have type');
      assert.ok(wisdom.content, 'Should have content');
      assert.ok(wisdom.origin, 'Should have origin');
      assert.ok(typeof wisdom.applicability === 'number', 'Should have applicability');
    });

    test('contains prudential heuristics', async () => {
      const { WISDOM_REPOSITORY } = await import('../src/grounding/index.js');

      const prudential = WISDOM_REPOSITORY.filter(w =>
        w.content.includes('reversible') || w.content.includes('doubt')
      );

      assert.ok(prudential.length > 0, 'Should have prudential wisdom');
    });
  });

  describe('Tradition Repository', () => {
    test('contains tradition sources', async () => {
      const { TRADITION_REPOSITORY } = await import('../src/grounding/index.js');

      assert.ok(TRADITION_REPOSITORY.length > 0, 'Should have traditions');

      // Check structure
      const tradition = TRADITION_REPOSITORY[0];
      assert.ok(tradition.type, 'Should have type');
      assert.ok(tradition.tradition, 'Should have tradition name');
      assert.ok(tradition.content, 'Should have content');
      assert.ok(typeof tradition.universality === 'number', 'Should have universality');
    });

    test('contains universal moral absolutes', async () => {
      const { TRADITION_REPOSITORY } = await import('../src/grounding/index.js');

      const absolutes = TRADITION_REPOSITORY.filter(t =>
        t.type === 'moral_absolute' && t.universality > 0.9
      );

      assert.ok(absolutes.length > 0, 'Should have moral absolutes');
    });

    test('contains meaning frameworks', async () => {
      const { TRADITION_REPOSITORY } = await import('../src/grounding/index.js');

      const frameworks = TRADITION_REPOSITORY.filter(t =>
        t.type === 'meaning_framework'
      );

      assert.ok(frameworks.length >= 3, 'Should have multiple meaning frameworks');
    });
  });

  describe('Grounding System', () => {
    test('creates and initializes', async () => {
      const { createGroundingSystem, resetGroundingSystem } = await import('../src/grounding/index.js');
      resetGroundingSystem();

      const system = createGroundingSystem();
      assert.ok(system, 'System should be created');
    });

    test('grounds claims', async () => {
      const { createGroundingSystem } = await import('../src/grounding/index.js');

      const system = createGroundingSystem();
      const claim = await system.ground('What is React?');

      assert.ok(claim, 'Should return claim');
      assert.ok(claim.domain, 'Should have domain');
      assert.ok(claim.authority, 'Should have authority');
      assert.ok(claim.level, 'Should have level');
    });

    test('tracks statistics', async () => {
      const { createGroundingSystem } = await import('../src/grounding/index.js');

      const system = createGroundingSystem();

      await system.ground('What is TypeScript?');
      await system.ground('should I do this');
      await system.ground('what is the meaning of life');

      const stats = system.stats();

      assert.strictEqual(stats.claimsGrounded, 3);
      assert.ok(stats.humanConsultations >= 2, 'Should have human consultations');
      // Check that we tracked some domains (may escalate to human on low confidence)
      assert.ok(stats.byDomain.factual >= 1, 'Should track factual');
      assert.ok(stats.byDomain.ethical >= 1, 'Should track ethical');
      assert.ok(stats.byDomain.existential >= 1, 'Should track existential');
    });

    test('escalates to human on low confidence', async () => {
      const { createGroundingSystem } = await import('../src/grounding/index.js');

      const system = createGroundingSystem({
        uncertaintyThreshold: 0.9, // Very high threshold
        defaultToHumanOnUncertainty: true,
      });

      const claim = await system.ground('Something uncertain');

      assert.ok(system.needsHuman(claim), 'Should escalate to human');
    });

    test('provides wisdom and tradition access', async () => {
      const { createGroundingSystem } = await import('../src/grounding/index.js');

      const system = createGroundingSystem();

      const wisdom = system.getWisdom();
      const traditions = system.getTraditions();

      assert.ok(wisdom.length > 0, 'Should have wisdom');
      assert.ok(traditions.length > 0, 'Should have traditions');
    });

    test('allows adding custom wisdom', async () => {
      const { createGroundingSystem } = await import('../src/grounding/index.js');

      const system = createGroundingSystem();
      const initialCount = system.getWisdom().length;

      system.addWisdom({
        type: 'heuristic',
        content: 'Test wisdom',
        origin: 'Test',
        applicability: 0.5,
      });

      assert.strictEqual(system.getWisdom().length, initialCount + 1);
    });
  });

  describe('Integration with Science', () => {
    test('connects science grounding function', async () => {
      const { createGroundingSystem } = await import('../src/grounding/index.js');

      const system = createGroundingSystem();

      // Mock science grounding
      system.connectScience(async (claim) => ({
        sources: [
          { type: 'paper', reference: 'test-paper', confidence: 0.9 }
        ],
        consensusLevel: 'settled',
      }));

      const claim = await system.ground('What is TypeScript?');

      assert.ok(claim.grounding.sources.length > 0, 'Should have sources');
      assert.ok(claim.confidence > 0.5, 'Should have higher confidence');
    });

    test('connects proof checker', async () => {
      const { createGroundingSystem } = await import('../src/grounding/index.js');

      const system = createGroundingSystem();

      // Mock proof checker
      system.connectProof(async (claim) => ({
        sources: [
          { type: 'proof', reference: 'formal-proof', confidence: 1.0 }
        ],
        consensusLevel: 'settled',
      }));

      const claim = await system.ground('Prove that 1+1=2');

      assert.ok(claim.grounding.sources.length > 0, 'Should have proof sources');
      assert.strictEqual(claim.level, 'verified', 'Should be verified');
    });
  });
});

console.log('Running Grounding Module Tests...\n');
