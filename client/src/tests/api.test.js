import { describe, it, expect } from 'vitest';
import { api } from '../api.js';

describe('api client', () => {
  it('exports an api object', () => {
    expect(api).toBeDefined();
    expect(typeof api).toBe('object');
  });

  // Auth
  it('has login method', () => expect(typeof api.login).toBe('function'));
  it('has getUsers method', () => expect(typeof api.getUsers).toBe('function'));
  it('has refreshToken method', () => expect(typeof api.refreshToken).toBe('function'));

  // Strains
  it('has getStrains method', () => expect(typeof api.getStrains).toBe('function'));
  it('has createStrain method', () => expect(typeof api.createStrain).toBe('function'));

  // Batches
  it('has getBatches method', () => expect(typeof api.getBatches).toBe('function'));
  it('has getBatch method', () => expect(typeof api.getBatch).toBe('function'));
  it('has createBatch method', () => expect(typeof api.createBatch).toBe('function'));
  it('has transitionBatch method', () => expect(typeof api.transitionBatch).toBe('function'));
  it('has updateBatch method', () => expect(typeof api.updateBatch).toBe('function'));
  it('has assignBatchRecipe method', () => expect(typeof api.assignBatchRecipe).toBe('function'));

  // Recipes
  it('has getFertigationRecipes method', () => expect(typeof api.getFertigationRecipes).toBe('function'));
  it('has createFertigationRecipe method', () => expect(typeof api.createFertigationRecipe).toBe('function'));
  it('has getFoliarRecipes method', () => expect(typeof api.getFoliarRecipes).toBe('function'));
  it('has createFoliarRecipe method', () => expect(typeof api.createFoliarRecipe).toBe('function'));

  // Containers
  it('has getContainers method', () => expect(typeof api.getContainers).toBe('function'));
  it('has getContainer method', () => expect(typeof api.getContainer).toBe('function'));
  it('has getContainerSummary method', () => expect(typeof api.getContainerSummary).toBe('function'));

  // Applications
  it('has getFertigationApplications method', () => expect(typeof api.getFertigationApplications).toBe('function'));
  it('has createFertigationApplication method', () => expect(typeof api.createFertigationApplication).toBe('function'));
  it('has getFoliarApplications method', () => expect(typeof api.getFoliarApplications).toBe('function'));
  it('has createFoliarApplication method', () => expect(typeof api.createFoliarApplication).toBe('function'));
  it('has getPesticideApplications method', () => expect(typeof api.getPesticideApplications).toBe('function'));
  it('has createPesticideApplication method', () => expect(typeof api.createPesticideApplication).toBe('function'));
  it('has clearPesticideREI method', () => expect(typeof api.clearPesticideREI).toBe('function'));

  // Observations
  it('has getObservations method', () => expect(typeof api.getObservations).toBe('function'));
  it('has createObservation method', () => expect(typeof api.createObservation).toBe('function'));

  // Container amendments
  it('has getContainerAmendments method', () => expect(typeof api.getContainerAmendments).toBe('function'));
  it('has createContainerAmendment method', () => expect(typeof api.createContainerAmendment).toBe('function'));
});
