const BASE = '/api';
const getToken = () => localStorage.getItem('cv_token');

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
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
