const BASE = '/api';
const getToken = () => localStorage.getItem('cv_token');

async function req(method, path, body) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  getUsers: () => req('GET', '/auth/users'),
  login: (user_id, pin) => req('POST', '/auth/login', { user_id, pin }),
  refreshToken: () => req('POST', '/auth/refresh'),

  // Items (reads from farmstock's items table via cultivate's API proxy — routes added in Phase 1)
  getItems: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/items${q ? '?' + q : ''}`);
  },

  // Catalog (farmstock items proxy — ingredient picker source)
  getCatalogItems: () => req('GET', '/catalog/items'),

  // Inventory (farmstock crop inputs including pesticides — cultivate Crop Inputs view)
  getInventory: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/catalog/inventory${q ? '?' + q : ''}`);
  },
  getInventoryItem: (id) => req('GET', `/catalog/inventory/${id}`),

  // Fertigation recipes
  getFertigationRecipes: () => req('GET', '/recipes/fertigation'),
  getFertigationRecipe: (id) => req('GET', `/recipes/fertigation/${id}`),
  getFertigationRecipeByName: (name) => req('GET', `/recipes/fertigation/by-name/${encodeURIComponent(name)}`),
  createFertigationRecipe: (data) => req('POST', '/recipes/fertigation', data),
  createFertigationRecipeVersion: (id, data) => req('POST', `/recipes/fertigation/${id}/version`, data),
  deleteFertigationRecipe: (id) => req('DELETE', `/recipes/fertigation/${id}`),

  // Foliar recipes
  getFoliarRecipes: () => req('GET', '/recipes/foliar'),
  getFoliarRecipe: (id) => req('GET', `/recipes/foliar/${id}`),
  createFoliarRecipe: (data) => req('POST', '/recipes/foliar', data),
  createFoliarRecipeVersion: (id, data) => req('POST', `/recipes/foliar/${id}/version`, data),
  deleteFoliarRecipe: (id) => req('DELETE', `/recipes/foliar/${id}`),

  // Strains
  getStrains: () => req('GET', '/strains'),
  createStrain: (data) => req('POST', '/strains', data),
  updateStrain: (id, data) => req('PUT', `/strains/${id}`, data),
  deleteStrain: (id) => req('DELETE', `/strains/${id}`),

  // Containers
  getContainerSummary: () => req('GET', '/containers/summary'),
  getContainers: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/containers${q ? '?' + q : ''}`);
  },
  getContainer: (id) => req('GET', `/containers/${encodeURIComponent(id)}`),
  updateContainerState: (id, data) => req('PATCH', `/containers/${encodeURIComponent(id)}/state`, data),
  updateContainerNotes: (id, data) => req('PATCH', `/containers/${encodeURIComponent(id)}/notes`, data),
  bulkResetContainersToReady: () => req('POST', '/containers/admin/bulk-reset-ready'),
  bulkSetContainerState: (data) => req('POST', '/containers/admin/bulk-set-state', data),

  // Container lifecycle
  startTeardown: (containerId, data) => req('POST', `/containers/${encodeURIComponent(containerId)}/teardown`, data),
  updateTeardown: (containerId, teardownId, data) => req('PATCH', `/containers/${encodeURIComponent(containerId)}/teardown/${teardownId}`, data),
  createSoilSample: (containerId, data) => req('POST', `/containers/${encodeURIComponent(containerId)}/soil-samples`, data),
  getSoilSamples: (containerId) => req('GET', `/containers/${encodeURIComponent(containerId)}/soil-samples`),
  addSoilResults: (containerId, sampleId, data) => req('POST', `/containers/${encodeURIComponent(containerId)}/soil-samples/${sampleId}/results`, data),
  startStartup: (containerId, data) => req('POST', `/containers/${encodeURIComponent(containerId)}/startup`, data),
  signOffReady: (containerId, startupId, data) => req('POST', `/containers/${encodeURIComponent(containerId)}/startup/${startupId}/ready`, data),

  // Fertigation applications
  getFertigationApplications: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/applications/fertigation${q ? '?' + q : ''}`);
  },
  createFertigationApplication: (data) => req('POST', '/applications/fertigation', data),
  updateFertigationApplication: (id, data) => req('PATCH', `/applications/fertigation/${id}`, data),
  deleteFertigationApplication: (id) => req('DELETE', `/applications/fertigation/${id}`),

  // Foliar applications
  getFoliarApplications: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/applications/foliar${q ? '?' + q : ''}`);
  },
  createFoliarApplication: (data) => req('POST', '/applications/foliar', data),
  updateFoliarApplication: (id, data) => req('PATCH', `/applications/foliar/${id}`, data),
  deleteFoliarApplication: (id) => req('DELETE', `/applications/foliar/${id}`),

  // Observations
  getObservations: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/observations${q ? '?' + q : ''}`);
  },
  createObservation: (data) => req('POST', '/observations', data),
  updateObservation: (id, data) => req('PATCH', `/observations/${id}`, data),
  deleteObservation: (id) => req('DELETE', `/observations/${id}`),
  getReadinessSummary: (batchId) => req('GET', `/observations/readiness-summary?batch_id=${batchId}`),

  // Pesticide applications
  getPesticideApplications: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/applications/pesticide${q ? '?' + q : ''}`);
  },
  createPesticideApplication: (data) => req('POST', '/applications/pesticide', data),
  updatePesticideApplication: (id, data) => req('PATCH', `/applications/pesticide/${id}`, data),
  deletePesticideApplication: (id) => req('DELETE', `/applications/pesticide/${id}`),
  clearPesticideREI: (id) => req('POST', `/applications/pesticide/${id}/clear-rei`),

  // Container amendments
  getContainerAmendments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/applications/amendments${q ? '?' + q : ''}`);
  },
  createContainerAmendment: (data) => req('POST', '/applications/amendments', data),
  updateContainerAmendment: (id, data) => req('PATCH', `/applications/amendments/${id}`, data),
  deleteContainerAmendment: (id) => req('DELETE', `/applications/amendments/${id}`),

  // Harvest
  getHarvestStatus: (batchId) => req('GET', `/harvest/batch/${batchId}`),
  createHarvestBatch: (data) => req('POST', '/harvest/batches', data),
  recordHarvestEvent: (harvestBatchId, data) => req('POST', `/harvest/batches/${harvestBatchId}/events`, data),
  forceCloseHarvestBatch: (harvestBatchId, data) => req('POST', `/harvest/batches/${harvestBatchId}/force-close`, data),
  createWasteTrim: (data) => req('POST', '/harvest/waste-trim', data),
  getWasteTrim: (params = {}) => { const q = new URLSearchParams(params).toString(); return req('GET', `/harvest/waste-trim${q ? '?' + q : ''}`); },
  disposeWasteTrim: (id, data) => req('PATCH', `/harvest/waste-trim/${id}/dispose`, data),

  // Tag assignments
  getContainerAssignments: (containerId) => req('GET', `/tag-assignments/container/${encodeURIComponent(containerId)}`),

  // Plant loss
  recordPlantLoss: (data) => req('POST', '/plant-loss', data),
  getPlantLoss: (params = {}) => { const q = new URLSearchParams(params).toString(); return req('GET', `/plant-loss${q ? '?' + q : ''}`); },
  recordReplacement: (data) => req('POST', '/plant-loss/replacements', data),

  // Batches
  getBatches: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req('GET', `/batches${q ? '?' + q : ''}`);
  },
  getBatch: (id) => req('GET', `/batches/${id}`),
  createBatch: (data) => req('POST', '/batches', data),
  transitionBatch: (id, data) => req('PATCH', `/batches/${id}/transition`, data),
  updateBatch: (id, data) => req('PATCH', `/batches/${id}`, data),
  assignBatchRecipe: (id, data) => req('PATCH', `/batches/${id}/recipe`, data),
};
