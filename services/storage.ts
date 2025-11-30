
export interface RecentFolder {
  name: string;
  handle: FileSystemDirectoryHandle;
  lastAccessed: number;
}

const DB_NAME = 'LensGradeDB';
const STORE_NAME = 'recent_handles';
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
  });
};

export const saveRecentFolder = async (handle: FileSystemDirectoryHandle) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const request = store.put({
        name: handle.name,
        handle: handle,
        lastAccessed: Date.now()
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("Failed to save recent folder", e);
  }
};

export const getRecentFolders = async (): Promise<RecentFolder[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result as RecentFolder[];
        // Sort by lastAccessed desc
        resolve(results.sort((a, b) => b.lastAccessed - a.lastAccessed));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("Failed to load recent folders", e);
    return [];
  }
};
