import axios from "axios";

export const SHARE_FILENAME = "share.json";
export const VERSION_FILENAME = "versionned.json";

const description = "drawDB diagram";
const baseUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000";

export async function create(filename, content) {
  try {
    const res = await axios.post(`${baseUrl}/designs`, {
      public: false,
      filename,
      description,
      content,
    });

    return res.data.data.id;
  } catch (error) {
    // Fallback to local storage when backend is not available
    console.warn("Backend not available, falling back to local storage:", error.message);
    const localId = generateLocalId();
    const localData = {
      id: localId,
      filename,
      content,
      created_at: new Date().toISOString(),
      isLocal: true
    };
    
    // Store in localStorage
    const existingData = JSON.parse(localStorage.getItem('local_designs') || '[]');
    existingData.push(localData);
    localStorage.setItem('local_designs', JSON.stringify(existingData));
    
    console.log("Saved to local storage with ID:", localId);
    return localId;
  }
}

function generateLocalId() {
  return 'local_' + Math.random().toString(36).substr(2, 9) + Date.now();
}

export async function patch(gistId, filename, content, version = undefined, lastModifiedBy = undefined) {
  // Handle local storage first
  if (gistId && gistId.startsWith('local_')) {
    console.log("Updating local design:", gistId);
    const existingData = JSON.parse(localStorage.getItem('local_designs') || '[]');
    const index = existingData.findIndex(item => item.id === gistId);
    
    if (index !== -1) {
      existingData[index].content = content;
      existingData[index].filename = filename;
      existingData[index].updated_at = new Date().toISOString();
      localStorage.setItem('local_designs', JSON.stringify(existingData));
      console.log("Local design updated successfully");
      return { deleted: false, version: 1 }; // Local designs don't have version conflicts
    } else {
      console.warn("Local design not found:", gistId);
      return { deleted: false, version: 1 };
    }
  }

  // Try server update with version control
  try {
    const payload = {
      filename,
      content,
    };
    
    // Add version control parameters if provided
    if (version !== undefined) {
      payload.version = version;
    }
    if (lastModifiedBy !== undefined) {
      payload.lastModifiedBy = lastModifiedBy;
    }

    const { data } = await axios.patch(`${baseUrl}/designs/${gistId}`, payload);

    return { 
      deleted: data.deleted || false,
      version: data.data?.version,
      success: data.success
    };
  } catch (error) {
    if (error.response && error.response.status === 409) {
      // Version conflict detected
      throw {
        conflict: true,
        data: error.response.data
      };
    }
    console.error("Failed to update on server:", error);
    throw error;
  }
}

// Get current design version
export async function getCurrentVersion(gistId) {
  // Handle local storage - always return version 1
  if (gistId && gistId.startsWith('local_')) {
    return { version: 1, lastModifiedBy: null };
  }

  try {
    const { data } = await axios.get(`${baseUrl}/designs/${gistId}`);
    // Extract version from the snapshot data
    return {
      version: data.data?.files?.['share.json']?.version || 1,
      lastModifiedBy: data.data?.files?.['share.json']?.lastModifiedBy,
      updatedAt: data.data?.updated_at
    };
  } catch (error) {
    console.error("Failed to get current version:", error);
    return { version: 1, lastModifiedBy: null };
  }
}

export async function del(gistId) {
  // Handle local storage first
  if (gistId && gistId.startsWith('local_')) {
    console.log("Deleting local design:", gistId);
    const existingData = JSON.parse(localStorage.getItem('local_designs') || '[]');
    const filteredData = existingData.filter(item => item.id !== gistId);
    localStorage.setItem('local_designs', JSON.stringify(filteredData));
    console.log("Local design deleted successfully");
    return;
  }

  // Try server
  try {
    await axios.delete(`${baseUrl}/designs/${gistId}`);
  } catch (error) {
    console.error("Failed to delete from server:", error);
    throw error;
  }
}

export async function get(gistId) {
  // Handle local storage first
  if (gistId && gistId.startsWith('local_')) {
    console.log("Getting local design:", gistId);
    const existingData = JSON.parse(localStorage.getItem('local_designs') || '[]');
    const localData = existingData.find(item => item.id === gistId);
    
    if (localData) {
      console.log("Local design found");
      return {
        files: {
          [SHARE_FILENAME]: {
            content: localData.content
          }
        }
      };
    } else {
      console.warn("Local design not found:", gistId);
      throw new Error("Local design not found");
    }
  }

  // Try server
  try {
    const res = await axios.get(`${baseUrl}/designs/${gistId}`);
    return res.data;
  } catch (error) {
    console.error("Failed to get from server:", error);
    throw error;
  }
}

export async function getCommits(gistId, perPage = 20, page = 1) {
  const res = await axios.get(`${baseUrl}/gists/${gistId}/commits`, {
    params: {
      per_page: perPage,
      page,
    },
  });

  return res.data;
}

export async function getVersion(gistId, sha) {
  console.log("Getting version from API:", `${baseUrl}/designs/${gistId}/${sha}`);
  const res = await axios.get(`${baseUrl}/designs/${gistId}/${sha}`);

  return res.data;
}

export async function getCommitsWithFile(
  gistId,
  file,
  limit = 10,
  cursor = null,
) {
  const res = await axios.get(
    `${baseUrl}/gists/${gistId}/file-versions/${file}`,
    {
      params: {
        limit,
        cursor,
      },
    },
  );

  return res.data;
}

export async function listDesigns(page = 1, limit = 10, search = "") {
  try {
    const res = await axios.get(`${baseUrl}/gists`, {
      params: {
        page,
        limit,
        search,
      },
    });

    return res.data;
  } catch (error) {
    // Fallback to local storage
    console.warn("Backend not available, using local storage");
    const localData = JSON.parse(localStorage.getItem('local_designs') || '[]');
    
    let filteredData = localData;
    if (search) {
      filteredData = localData.filter(item => 
        item.filename?.toLowerCase().includes(search.toLowerCase()) ||
        (item.content && JSON.parse(item.content).title?.toLowerCase().includes(search.toLowerCase()))
      );
    }
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = filteredData.slice(startIndex, endIndex);
    
    // Convert to expected format
    const formattedData = paginatedData.map(item => {
      let parsedContent = {};
      try {
        parsedContent = JSON.parse(item.content || '{}');
      } catch (e) {
        console.warn('Failed to parse content:', e);
      }
      
      return {
        id: item.id,
        name: parsedContent.title || item.filename || 'Untitled Diagram',
        database: parsedContent.database || 'Generic',
        tables: parsedContent.tables || [],
        relationships: parsedContent.relationships || [],
        last_modified: item.updated_at || item.created_at,
        updated_at: item.updated_at || item.created_at
      };
    });
    
    return {
      data: formattedData,
      pagination: {
        total: filteredData.length,
        page: page,
        limit: limit,
        totalPages: Math.ceil(filteredData.length / limit)
      }
    };
  }
}

// Create manual snapshot/version
export async function createSnapshot(gistId, comment = '') {
  // Skip for local storage designs
  if (gistId && gistId.startsWith('local_')) {
    console.log("Snapshots not supported for local designs");
    return { success: false, message: "Snapshots not supported for local designs" };
  }

  try {
    const { data } = await axios.post(`${baseUrl}/designs/${gistId}/snapshot`, {
      comment
    });
    return data;
  } catch (error) {
    console.error("Failed to create snapshot:", error);
    throw error;
  }
}

// Get versions/snapshots for a design
export async function getVersions(gistId) {
  // Skip for local storage designs
  if (gistId && gistId.startsWith('local_')) {
    console.log("Versions not supported for local designs");
    return { data: [] };
  }

  console.log("Getting versions for design ID:", gistId);
  console.log("API URL:", `${baseUrl}/designs/${gistId}/versions`);

  try {
    const { data } = await axios.get(`${baseUrl}/designs/${gistId}/versions`);
    console.log("Raw API response:", data);
    return { data: data.data || [] };
  } catch (error) {
    console.error("Failed to get versions:", error);
    console.error("Error details:", error.response?.data);
    return { data: [] };
  }
}
