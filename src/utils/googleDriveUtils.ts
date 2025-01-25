import * as XLSX from "xlsx";

// Cache to store fetched files
const fileCache = new Map<string, any>();

export const fetchFileData = async (
  authToken: string,
  file: { id: string; name: string; mimeType: string }
) => {
  if (fileCache.has(file.id)) {
    return fileCache.get(file.id);
  }

  const url =
    file.mimeType === "application/vnd.google-apps.spreadsheet"
      ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
      : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${file.name}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

  fileCache.set(file.id, data);
  return data;
};

export const fetchFolders = async (authToken: string, parentFolderId: string) => {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );

  const { files } = await response.json();
  return files.map((file: { id: string; name: string }) => ({
    id: file.id,
    name: file.name,
  }));
};

export const clearCache = () => {
  fileCache.clear();
};

export const convertTo24Hr = (timeStr: string) => {
  const [time, modifier] = timeStr.trim().split(/(AM|PM)/i);
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier?.toUpperCase() === "PM" && hours < 12) {
    hours += 12;
  }
  if (modifier?.toUpperCase() === "AM" && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};
