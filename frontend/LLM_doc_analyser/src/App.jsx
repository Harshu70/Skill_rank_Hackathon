import { useState, useEffect } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [originalFileName, setOriginalFileName] = useState("");

  // Function to fetch the analysis history from the backend
  const fetchHistory = async () => {
    try {
      const res = await axios.get("http://localhost:5000/history");
      setHistory(res.data);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  // Fetch initial history when the component mounts
  useEffect(() => {
    fetchHistory();
  }, []);

  const handleFileChange = (e) => {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (selectedFile) {
          setOriginalFileName(selectedFile.name);
      }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError("Please select a file first.");
      return;
    }
    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    setSelectedHistoryId(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("http://localhost:5000/analyze", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAnalysisResult(res.data);
      fetchHistory();
    } catch (err) {
      console.error("Analysis failed:", err);
      setError("Failed to analyze the document. Please check the server logs.");
    } finally {
      setLoading(false);
    }
  };

  const handleHistoryClick = async (id) => {
    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    setSelectedHistoryId(id);

    try {
        const res = await axios.get(`http://localhost:5000/history/${id}`);
        const data = res.data;
        setOriginalFileName(data.filename); // Set filename from history
        setAnalysisResult({
            text: data.content,
            docType: { type: data.doc_type, confidence: data.confidence },
            missing: { missing_fields: data.missing_fields },
            recommendations: data.recommendations,
            extractedFields: data.extracted_fields
        });
    } catch (err) {
        console.error("Failed to fetch history detail:", err);
        setError("Failed to load the selected analysis.");
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (idToDelete, event) => {
    event.stopPropagation();
    try {
      await axios.delete(`http://localhost:5000/history/${idToDelete}`);
      fetchHistory();
      if (selectedHistoryId === idToDelete) {
        setAnalysisResult(null);
        setSelectedHistoryId(null);
        setOriginalFileName("");
      }
    } catch (err) {
      console.error("Failed to delete history item:", err);
      setError("Failed to delete the analysis. Please try again.");
    }
  };

  const formatFieldName = (name) => {
    return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // **REVISED:** Function to generate a report in a new window for printing to PDF
  const handleDownloadReport = () => {
    if (!analysisResult) return;

    const detailsHTML = analysisResult.extractedFields && Object.keys(analysisResult.extractedFields).length > 0
      ? `<h2>Extracted Details</h2>
         <ul>
           ${Object.entries(analysisResult.extractedFields).map(([key, value]) => `<li><strong>${formatFieldName(key)}:</strong> ${value}</li>`).join('')}
         </ul>`
      : '';

    const missingHTML = analysisResult.missing.missing_fields.length > 0
      ? `<h2>Missing Fields Analysis</h2>
         <ul>
           ${analysisResult.missing.missing_fields.map(field => `<li>- ${formatFieldName(field)}</li>`).join('')}
         </ul>`
      : '';

    const recommendationsHTML = analysisResult.recommendations && analysisResult.recommendations.length > 0
      ? `<h2>Improvement Checklist</h2>
         <ul>
           ${analysisResult.recommendations.map(rec => `<li>${rec}</li>`).join('')}
         </ul>`
      : '';

    const reportHTML = `
      <html>
        <head>
          <title>Document Analysis Report</title>
          <style>
            body { font-family: sans-serif; margin: 2em; }
            h1 { text-align: center; color: #333; }
            h2 { color: #555; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
            ul { list-style-type: none; padding-left: 0; }
            li { margin-bottom: 0.5em; }
            strong { color: #444; }
          </style>
        </head>
        <body>
          <h1>Document Analysis Report</h1>
          <p><strong>Original File:</strong> ${originalFileName}</p>
          ${detailsHTML}
          ${missingHTML}
          ${recommendationsHTML}
        </body>
      </html>
    `;

    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(reportHTML);
    reportWindow.document.close();
    reportWindow.print();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 px-4">
        
        <div className="w-full bg-white rounded-2xl shadow-lg p-8 space-y-6 h-fit">
          <h1 className="text-3xl font-bold text-center text-blue-600 mb-6">
            LLM Document Analyzer
          </h1>

          <div className="flex flex-col items-center gap-4 border-b pb-6">
            <input
              type="file"
              accept="application/pdf"
              className="block w-full max-w-xs text-sm border border-amber-200 rounded-lg cursor-pointer bg-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-300 p-4"
              onChange={handleFileChange}
            />
            <button
              onClick={handleAnalyze}
              disabled={!file || loading}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors duration-300 text-lg"
            >
              {loading ? "Analyzing..." : "Analyze Document"}
            </button>
          </div>

          {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-center">
                  {error}
              </div>
          )}

          {analysisResult && (
            <div className="space-y-6">
               <div className="text-center">
                 <button
                   onClick={handleDownloadReport}
                   className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors duration-300"
                 >
                   Download Report
                 </button>
               </div>
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-700">Extracted Text</h3>
                <div className="bg-gray-50 p-3 rounded-lg h-40 overflow-y-auto border border-gray-200 text-sm text-gray-600 whitespace-pre-wrap">
                  {analysisResult.text}
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-700">Document Type</h3>
                <p className="text-gray-800 bg-gray-50 p-3 rounded-lg border">
                  Type: <span className="font-bold text-green-600">{analysisResult.docType.type}</span>{" "}
                  (Confidence: <span className="font-bold text-blue-600">{(analysisResult.docType.confidence * 100).toFixed(0)}%</span>)
                </p>
              </div>

              {analysisResult.extractedFields && Object.keys(analysisResult.extractedFields).length > 0 && (
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-gray-700">Extracted Details</h3>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-sm text-gray-800 space-y-2">
                      {Object.entries(analysisResult.extractedFields).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-3 gap-2">
                              <strong className="text-gray-600 col-span-1">{formatFieldName(key)}:</strong>
                              <span className="text-gray-800 col-span-2">{value}</span>
                          </div>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-700">Missing Fields Analysis</h3>
                {analysisResult.missing.missing_fields.length > 0 ? (
                  <div className="bg-red-50 p-3 rounded-lg border border-red-200 text-sm text-gray-800">
                      <ul className="list-disc list-inside">
                          {analysisResult.missing.missing_fields.map(field => (
                              <li key={field}>{field.replace(/_/g, ' ')}</li>
                          ))}
                      </ul>
                  </div>
                ) : (
                  <p className="text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
                      All required fields appear to be present.
                  </p>
                )}
              </div>

              {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-gray-700">Improvement Checklist</h3>
                  <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-sm text-gray-800 space-y-2">
                      {analysisResult.recommendations.map((rec, index) => (
                          <div key={index} className="flex items-start">
                              <svg className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span>{rec}</span>
                          </div>
                      ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        <div className="w-full bg-white rounded-2xl shadow-lg p-8 h-fit">
            <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Analysis History</h2>
            <div className="space-y-3 max-h-[80vh] overflow-y-auto pr-2">
                {history.length > 0 ? (
                    history.map((item) => (
                        <div 
                            key={item.id} 
                            onClick={() => handleHistoryClick(item.id)}
                            className={`relative bg-gray-50 border p-4 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors duration-200 ${
                                selectedHistoryId === item.id ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200'
                            }`}
                        >
                            <button
                                onClick={(e) => handleDelete(item.id, e)}
                                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 text-xs font-bold"
                                aria-label="Delete analysis"
                            >
                                X
                            </button>
                            <div className="pr-6">
                                <p className="font-semibold text-gray-700 pointer-events-none">{item.filename}</p>
                                <p className="text-sm text-gray-500 pointer-events-none">
                                    Type: <span className="font-medium text-gray-600">{item.doc_type}</span>
                                </p>
                                <p className="text-xs text-gray-400 mt-1 pointer-events-none">
                                    Analyzed on: {new Date(item.analyzed_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                </p>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-center text-gray-500 mt-4">No analysis history found.</p>
                )}
            </div>
        </div>

      </div>
    </div>
  );
}

export default App;

