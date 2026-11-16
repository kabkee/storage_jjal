// 로컬 관리 화면 API 클라이언트 (admin/vite-plugin-admin.mjs 와 짝)
async function request (method, url, body, headers = {}) {
  const res = await fetch(`/__admin/api${url}`, {
    method,
    headers: body instanceof Blob ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`)
  return data
}

export const api = {
  images: () => request('GET', '/images'),
  updateImage: (id, fields) => request('PUT', `/images/${id}`, fields),
  suggestForImage: (id, hint) => request('POST', `/images/${id}/suggest`, { hint }),
  addTaxonomy: (axis, ko, en) => request('POST', '/taxonomy', { axis, ko, en }),
  uploads: () => request('GET', '/uploads'),
  upload: file => request('POST', '/uploads', file, { 'X-Filename': encodeURIComponent(file.name || '') }),
  retryUpload: (id, hint) => request('POST', `/uploads/${id}/suggest`, { hint }),
  commitUpload: (id, fields) => request('POST', `/uploads/${id}/commit`, fields),
  removeUpload: id => request('DELETE', `/uploads/${id}`),
  gitStatus: () => request('GET', '/git'),
  publish: push => request('POST', '/git/publish', { push }),
}

// "고양이, Cat, 하품" ↔ ['고양이', 'Cat', '하품']
export const splitTag = tag => String(tag || '').split(',').map(s => s.trim()).filter(Boolean)
export const joinTag = list => list.map(s => String(s).trim()).filter(Boolean).join(', ')

export const pickFields = rec => ({
  name: rec?.name || '',
  emotion: [...(rec?.emotion || [])],
  situation: [...(rec?.situation || [])],
  tag: rec?.tag || '',
})
