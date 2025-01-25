import React, { useState, useContext } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { AuthContext } from "../App";

interface ProcessorProps {
  processFunction: (authToken: string, folder: any) => Promise<any>;
  title: string;
  selectedFolder: any;
  disabled: boolean;
}

const Processor: React.FC<ProcessorProps> = ({
  processFunction,
  title,
  selectedFolder,
  disabled,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const auth = useContext(AuthContext);

  const handleProcess = async () => {
    if (!auth?.accessToken || !selectedFolder) {
      setStatus("Error: Please authenticate and select a folder first.");
      return;
    }

    setIsLoading(true);
    setStatus(`Processing ${title.toLowerCase()}...`);

    try {
      const data = await processFunction(auth.accessToken, selectedFolder);
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, title);

      const excelData = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelData], { type: "application/octet-stream" });
      saveAs(blob, `${title}_Processed.xlsx`);

      setStatus(`${title} processing complete!`);
    } catch (error) {
      setStatus(`Error processing ${title.toLowerCase()}: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold text-primary mb-4">{title}</h2>
      <button
        onClick={handleProcess}
        disabled={isLoading || disabled || !selectedFolder}
        className={`rounded-lg px-6 py-3 font-semibold text-white ${
          isLoading || disabled || !selectedFolder
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-primary hover:bg-highlight-primary"
        }`}
      >
        {isLoading ? "Processing..." : `Process ${title}`}
      </button>
      {status && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            status.includes("Error")
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {status}
        </div>
      )}
    </div>
  );
};

export default Processor;
