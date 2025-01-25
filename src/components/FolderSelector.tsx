import React from "react";

interface Folder {
  id: string;
  name: string;
}

interface FolderSelectorProps {
  folders: Folder[];
  selectedFolder: string | null;
  onSelect: (id: string) => void;
  label: string;
  disabled: boolean;
}

const FolderSelector: React.FC<FolderSelectorProps> = ({
  folders,
  selectedFolder,
  onSelect,
  label,
  disabled,
}) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label}
    </label>
    <select
      value={selectedFolder || ""}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
      className="w-full p-2 border rounded-md bg-white disabled:bg-gray-100"
    >
      <option value="">Select a folder</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.name}
        </option>
      ))}
    </select>
  </div>
);

export default FolderSelector;
