// Aplicador mínimo de JSON Patch (RFC 6902) para el endpoint feed/live/diffPatch de MLB.
// Muta `doc` en sitio. Cualquier operación inválida lanza error y quien llama descarta el documento.

const unescape = (token) => token.replace(/~1/g, '/').replace(/~0/g, '~');

const parsePointer = (path) => {
    if (path === '') return [];
    if (path[0] !== '/') throw new Error(`JSON pointer inválido: ${path}`);
    return path.slice(1).split('/').map(unescape);
};

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const resolveParent = (doc, tokens) => {
    let node = doc;
    for (let i = 0; i < tokens.length - 1; i++) {
        const key = Array.isArray(node) ? Number(tokens[i]) : tokens[i];
        node = node[key];
        if (node === null || typeof node !== 'object') {
            throw new Error(`Ruta inexistente: /${tokens.slice(0, i + 1).join('/')}`);
        }
    }
    return node;
};

const getAt = (doc, path) => {
    const tokens = parsePointer(path);
    if (tokens.length === 0) return doc;
    const parent = resolveParent(doc, tokens);
    const last = tokens[tokens.length - 1];
    return Array.isArray(parent) ? parent[Number(last)] : parent[last];
};

const add = (doc, path, value) => {
    const tokens = parsePointer(path);
    if (tokens.length === 0) throw new Error('No se reemplaza la raíz con add');
    const parent = resolveParent(doc, tokens);
    const last = tokens[tokens.length - 1];
    if (Array.isArray(parent)) {
        const index = last === '-' ? parent.length : Number(last);
        if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`Índice inválido: ${path}`);
        parent.splice(index, 0, value);
    } else {
        parent[last] = value;
    }
};

const remove = (doc, path) => {
    const tokens = parsePointer(path);
    const parent = resolveParent(doc, tokens);
    const last = tokens[tokens.length - 1];
    if (Array.isArray(parent)) {
        const index = Number(last);
        if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error(`Índice inválido: ${path}`);
        return parent.splice(index, 1)[0];
    }
    if (!(last in parent)) throw new Error(`No existe: ${path}`);
    const value = parent[last];
    delete parent[last];
    return value;
};

const replace = (doc, path, value) => {
    const tokens = parsePointer(path);
    const parent = resolveParent(doc, tokens);
    const last = tokens[tokens.length - 1];
    if (Array.isArray(parent)) {
        const index = Number(last);
        if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error(`Índice inválido: ${path}`);
        parent[index] = value;
    } else {
        parent[last] = value;
    }
};

/**
 * @param {object} doc documento a mutar
 * @param {Array<{op: string, path: string, value?: any, from?: string}>} operations
 */
const applyPatch = (doc, operations) => {
    for (const operation of operations) {
        switch (operation.op) {
            case 'add':
                add(doc, operation.path, clone(operation.value));
                break;
            case 'remove':
                remove(doc, operation.path);
                break;
            case 'replace':
                replace(doc, operation.path, clone(operation.value));
                break;
            case 'move':
                add(doc, operation.path, remove(doc, operation.from));
                break;
            case 'copy':
                add(doc, operation.path, clone(getAt(doc, operation.from)));
                break;
            case 'test':
                if (JSON.stringify(getAt(doc, operation.path)) !== JSON.stringify(operation.value)) {
                    throw new Error(`test falló en ${operation.path}`);
                }
                break;
            default:
                throw new Error(`Operación desconocida: ${operation.op}`);
        }
    }
    return doc;
};

module.exports = { applyPatch };
