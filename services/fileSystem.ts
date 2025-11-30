import { EvaluationResult } from '../types';

// Define missing type for permission descriptor
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

export const verifyPermission = async (fileHandle: FileSystemHandle, readWrite: boolean = false) => {
  // Check if it's a real handle (has queryPermission) or a mock handle (from input fallback)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = fileHandle as any;
  if (typeof handle.queryPermission !== 'function') {
    return true; // Mock handles (File objects) are always readable/available in memory
  }

  const options: FileSystemHandlePermissionDescriptor = {
    mode: readWrite ? 'readwrite' : 'read',
  };
  
  try {
    // Check if we already have permission
    if ((await handle.queryPermission(options)) === 'granted') {
        return true;
    }
    // Request permission (must be triggered by user gesture)
    if ((await handle.requestPermission(options)) === 'granted') {
        return true;
    }
  } catch (e) {
      console.warn("Permission check failed", e);
      return false;
  }
  return false;
};

export const getBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const parseXMP = async (fileHandle: FileSystemFileHandle): Promise<EvaluationResult | null> => {
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");

    // Extract Rating (xmp:Rating)
    const ratingNode = xmlDoc.getElementsByTagName("xmp:Rating")[0];
    const rating = ratingNode ? parseInt(ratingNode.textContent || "0", 10) : 0;
    const totalScore = Math.min(100, rating * 20);

    // Extract Label (xmp:Label) -> Mapped to Keep (Select) vs Discard (Reject)
    const labelNode = xmlDoc.getElementsByTagName("xmp:Label")[0];
    const label = labelNode ? labelNode.textContent : "";
    // If it's labeled "Select" (or previously "Portfolio"), we consider it worth keeping.
    const isWorthKeeping = label === "Select" || label === "Portfolio";

    // Extract Description (dc:description -> rdf:Alt -> rdf:li)
    let feedback = "";
    const descNode = xmlDoc.getElementsByTagName("dc:description")[0];
    if (descNode) {
      const liNodes = descNode.getElementsByTagName("rdf:li");
      if (liNodes.length > 0) {
        feedback = liNodes[0].textContent || "";
      }
    }

    return {
      totalScore,
      isWorthKeeping,
      feedback: feedback.replace(/^Score: \d+\/100\. /, ""), // Remove score prefix if present
      // Set sub-scores to average or totalScore for visualization purposes
      compositionScore: totalScore,
      lightingScore: totalScore,
      technicalScore: totalScore,
      artisticScore: totalScore,
    };
  } catch (error) {
    console.error("Error parsing XMP:", error);
    return null;
  }
};

export const generateXMPContent = (evaluation: EvaluationResult): string => {
  // Map 0-100 score to 0-5 stars for xmp:Rating
  const rating = Math.max(0, Math.min(5, Math.round(evaluation.totalScore / 20)));
  
  // Use xmp:Label for Keep/Discard status
  // "Select" for Keep, "Reject" for Discard
  const label = evaluation.isWorthKeeping ? "Select" : "Reject";

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:dc="http://purl.org/dc/elements/1.1/">
      <xmp:Rating>${rating}</xmp:Rating>
      <xmp:Label>${label}</xmp:Label>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">Score: ${evaluation.totalScore}/100. ${evaluation.feedback}</rdf:li>
        </rdf:Alt>
      </dc:description>
      <dc:subject>
        <rdf:Bag>
          <rdf:li>LensGradeAI</rdf:li>
          ${evaluation.isWorthKeeping ? '<rdf:li>Select</rdf:li>' : '<rdf:li>Reject</rdf:li>'}
        </rdf:Bag>
      </dc:subject>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
};

export const saveXMPInDirectory = async (
    dirHandle: FileSystemDirectoryHandle, 
    imageName: string, 
    content: string
) => {
    // Replace extension with .xmp
    const xmpName = imageName.replace(/\.[^/.]+$/, "") + ".xmp";
    
    const xmpHandle = await dirHandle.getFileHandle(xmpName, { create: true });
    // Verify write permission
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const hasPerm = await verifyPermission(xmpHandle, true);
    
    const writable = await xmpHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return xmpHandle;
};

export const deleteFile = async (
  dirHandle: FileSystemDirectoryHandle, 
  fileName: string, 
  xmpHandle?: FileSystemFileHandle
) => {
  // Delete the image file
  await dirHandle.removeEntry(fileName);
  
  // Delete the XMP sidecar if it exists
  if (xmpHandle) {
    try {
      await dirHandle.removeEntry(xmpHandle.name);
    } catch (e) {
      console.warn("Could not delete associated XMP file", e);
    }
  }
};

export const moveFileToSubfolder = async (
  dirHandle: FileSystemDirectoryHandle,
  fileHandle: FileSystemFileHandle,
  subfolderName: string,
  xmpHandle?: FileSystemFileHandle
) => {
  // 1. Get or create the subfolder
  const subDir = await dirHandle.getDirectoryHandle(subfolderName, { create: true });

  // Helper to copy and delete (Move)
  const move = async (handle: FileSystemFileHandle) => {
    try {
      const file = await handle.getFile();
      const newHandle = await subDir.getFileHandle(handle.name, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(file);
      await writable.close();
      await dirHandle.removeEntry(handle.name);
    } catch (e) {
      console.error(`Failed to move file ${handle.name}`, e);
      throw e;
    }
  };

  // Move image
  await move(fileHandle);

  // Move XMP if exists
  if (xmpHandle) {
    try {
      await move(xmpHandle);
    } catch (e) {
      console.warn(`Failed to move XMP ${xmpHandle.name}`, e);
    }
  }
};