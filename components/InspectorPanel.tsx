import React, { useState, useEffect } from 'react';
import { ImageFile } from '../types';
import { evaluateImage } from '../services/geminiService';
import { getBase64, saveXMPInDirectory, generateXMPContent } from '../services/fileSystem';
import { XCircle, CheckCircle, BarChart2, Save, FileText, Loader2, Award, Download, RefreshCw, Archive, Trash2, AlertTriangle } from 'lucide-react';

interface InspectorPanelProps {
  file: ImageFile | null;
  dirHandle: FileSystemDirectoryHandle | null;
  onUpdateFile: (updatedFile: ImageFile) => void;
  onDeleteFile?: (file: ImageFile) => Promise<void>;
  onClose: () => void;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({ file, dirHandle, onUpdateFile, onDeleteFile, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    if (file) {
      // Don't reset loading state if the file is currently processing in background
      setLoading(file.status === 'processing');
      setError(file.errorMessage || null);
      setJustSaved(false);
      setShowDeleteConfirm(false);
      
      const loadPreview = async () => {
        try {
          const f = await file.handle.getFile();
          url = URL.createObjectURL(f);
          setPreviewUrl(url);
        } catch (e) {
          console.error(e);
          setError("Could not load image preview.");
        }
      };
      loadPreview();
    } else {
      setPreviewUrl(null);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const handleEvaluate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    
    // Update status to processing immediately in parent
    onUpdateFile({ ...file, status: 'processing' });

    try {
      const fileData = await file.handle.getFile();
      const base64 = await getBase64(fileData);
      const result = await evaluateImage(base64, fileData.type);
      
      // Auto-save if directory access is available
      let xmpHandle = file.xmpHandle;
      if (dirHandle) {
         try {
             xmpHandle = await saveXMPInDirectory(dirHandle, file.name, generateXMPContent(result));
             setJustSaved(true);
             setTimeout(() => setJustSaved(false), 3000);
         } catch (e) {
             console.error("Auto-save failed during manual evaluation", e);
         }
      }

      onUpdateFile({
        ...file,
        status: 'done',
        evaluation: result,
        xmpHandle
      });
    } catch (err: any) {
      const msg = err.message || "Evaluation failed";
      setError(msg);
      onUpdateFile({ ...file, status: 'error', errorMessage: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveXMP = async () => {
    if (!file || !file.evaluation) return;
    setSaving(true);
    try {
      const content = generateXMPContent(file.evaluation);
      
      if (dirHandle) {
        // Normal mode: Save to disk via API
        const xmpHandle = await saveXMPInDirectory(dirHandle, file.name, content);
        onUpdateFile({
            ...file,
            xmpHandle
        });
      } else {
        // Fallback mode: Download file
        const blob = new Blob([content], { type: 'application/rdf+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.replace(/\.[^/.]+$/, "") + ".xmp";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err: any) {
      console.error(err);
      setError("Failed to save XMP: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!file || !onDeleteFile) return;
    setIsDeleting(true);
    try {
        await onDeleteFile(file);
        // Parent will handle closing/selection change
    } catch (e: any) {
        setError("Failed to delete file: " + e.message);
        setIsDeleting(false);
    }
  };

  if (!file) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500 p-6">
        <p>Select an image to inspect details.</p>
      </div>
    );
  }

  const ScoreBar = ({ label, score, colorClass }: { label: string, score: number, colorClass: string }) => (
    <div className="mb-3">
      <div className="flex justify-between text-xs uppercase tracking-wider text-gray-400 mb-1">
        <span>{label}</span>
        <span className="font-mono text-white">{score}</span>
      </div>
      <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
        <div 
            className={`h-full ${colorClass} transition-all duration-1000 ease-out`} 
            style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 p-4 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <h2 className="text-lg font-semibold text-white truncate pr-4" title={file.name}>{file.name}</h2>
        <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white">
          <XCircle size={20} />
        </button>
      </div>

      {/* Preview */}
      <div className="relative aspect-video w-full bg-black shrink-0">
        {previewUrl ? (
          <img src={previewUrl} className="h-full w-full object-contain" alt="Preview" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
             <Loader2 className="animate-spin text-gray-600" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {error && (
            <div className="mb-4 rounded bg-red-900/30 border border-red-800 p-3 text-sm text-red-200">
                {error}
            </div>
        )}

        {showDeleteConfirm && (
            <div className="mb-4 rounded-lg bg-red-900/20 border border-red-800 p-4 animate-in slide-in-from-top-2">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="text-red-500 shrink-0" size={20}/>
                    <div>
                        <h4 className="font-semibold text-red-200 text-sm">Delete File?</h4>
                        <p className="text-xs text-red-300/70 mt-1 mb-3">This will permanently remove the image and its XMP sidecar from your disk.</p>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded transition"
                            >
                                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                            <button 
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {(loading || file.status === 'processing') ? (
            <div className="flex flex-col items-center justify-center py-10 text-center animate-pulse">
                <RefreshCw className="mb-4 h-12 w-12 text-indigo-500 animate-spin" />
                <h3 className="text-lg font-medium text-white">Analyzing Potential...</h3>
                <p className="text-gray-500 text-sm">Reviewing composition, focus, and editing possibilities.</p>
            </div>
        ) : !file.evaluation ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <BarChart2 className="mb-4 h-12 w-12 text-gray-600" />
            <p className="mb-6 text-gray-400">No evaluation data yet.</p>
            <div className="flex gap-3">
                <button
                onClick={handleEvaluate}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white transition hover:bg-indigo-500"
                >
                <Award size={18}/> Analyze with AI
                </button>
                
                {dirHandle && onDeleteFile && !showDeleteConfirm && (
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center justify-center rounded-lg bg-gray-800 px-3 py-2.5 text-gray-400 hover:bg-red-900/30 hover:text-red-400 transition"
                        title="Delete File"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
            {/* Final Score */}
            <div className={`flex items-center justify-between rounded-xl p-4 border ${
                file.evaluation.isWorthKeeping 
                ? 'bg-green-900/20 border-green-800' 
                : 'bg-red-900/10 border-red-900/30'
            }`}>
                <div>
                    <h3 className={`text-sm uppercase tracking-widest font-semibold ${
                        file.evaluation.isWorthKeeping ? 'text-green-400' : 'text-red-400'
                    }`}>
                        {file.evaluation.isWorthKeeping ? 'Worth Keeping' : 'Discard'}
                    </h3>
                    <div className="text-3xl font-bold text-white mt-1">{file.evaluation.totalScore}<span className="text-sm text-gray-500 font-normal"> / 100</span></div>
                </div>
                <div className={`text-4xl ${file.evaluation.isWorthKeeping ? 'text-green-500' : 'text-gray-600'}`}>
                    {file.evaluation.isWorthKeeping ? <Archive size={40} /> : <Trash2 size={40} />}
                </div>
            </div>
            
            {/* Feedback */}
            <div className="rounded-lg bg-gray-800/50 p-4 border border-gray-800">
                <p className="text-gray-300 italic text-sm leading-relaxed">"{file.evaluation.feedback}"</p>
                {file.evaluation.isWorthKeeping && (
                    <div className="mt-2 text-xs text-indigo-400 font-medium flex items-center gap-1">
                        Suggested Action: Edit in Post
                    </div>
                )}
            </div>

            {/* Metrics */}
            <div className="space-y-4">
                <ScoreBar label="Composition" score={file.evaluation.compositionScore} colorClass="bg-blue-500" />
                <ScoreBar label="Lighting" score={file.evaluation.lightingScore} colorClass="bg-yellow-500" />
                <ScoreBar label="Technical" score={file.evaluation.technicalScore} colorClass="bg-purple-500" />
                <ScoreBar label="Potential" score={file.evaluation.artisticScore} colorClass="bg-pink-500" />
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-gray-800">
                <div className="flex gap-2">
                    <button
                        onClick={handleSaveXMP}
                        disabled={saving}
                        className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition ${
                            justSaved 
                            ? 'bg-green-600 text-white' 
                            : 'bg-gray-700 text-white hover:bg-gray-600'
                        } disabled:opacity-50`}
                    >
                        {saving ? <Loader2 className="animate-spin" size={18}/> : 
                        justSaved ? <CheckCircle size={18}/> : 
                        dirHandle ? <Save size={18}/> : <Download size={18}/>}
                        
                        {justSaved ? 'Saved!' : dirHandle ? 'Save Sidecar' : 'Download Sidecar'}
                    </button>
                    
                    {dirHandle && onDeleteFile && !showDeleteConfirm && (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex items-center justify-center rounded-lg bg-gray-800 px-4 py-3 text-gray-400 hover:bg-red-900/30 hover:text-red-400 transition border border-gray-700 hover:border-red-900/50"
                            title="Delete File"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                </div>

                {file.xmpHandle && !justSaved && (
                     <p className="mt-2 text-center text-xs text-gray-500 flex items-center justify-center gap-1">
                        <FileText size={12}/> Sidecar exists
                     </p>
                )}
                {!dirHandle && !justSaved && (
                     <p className="mt-2 text-center text-xs text-yellow-600 flex items-center justify-center gap-1">
                        Manual download required (Read-only mode)
                     </p>
                )}
            </div>
            
            <button 
                onClick={handleEvaluate} 
                disabled={loading}
                className="w-full text-center text-xs text-indigo-400 hover:text-indigo-300 mt-2"
            >
                Re-run Analysis
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InspectorPanel;