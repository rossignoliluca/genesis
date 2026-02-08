/**
 * DocumentGenerator - Modal for generating documents from conversations
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChatConversation } from '../../stores/genesisStore';

interface DocumentGeneratorProps {
  conversation: ChatConversation;
  onClose: () => void;
  dashboardUrl: string;
}

type DocType = 'report' | 'presentation' | 'summary' | 'code';
type DocFormat = 'md' | 'pptx' | 'pdf';

export const DocumentGenerator: React.FC<DocumentGeneratorProps> = ({
  conversation,
  onClose,
  dashboardUrl,
}) => {
  const [docType, setDocType] = useState<DocType>('report');
  const [format, setFormat] = useState<DocFormat>('md');
  const [includeToolOutputs, setIncludeToolOutputs] = useState(true);
  const [includeContext, setIncludeContext] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    success: boolean;
    path?: string;
    error?: string;
    metadata?: { wordCount?: number; pages?: number };
  } | null>(null);

  const docTypes: { value: DocType; label: string; icon: string; desc: string }[] = [
    { value: 'report', label: 'Report', icon: '📄', desc: 'Detailed document with all messages' },
    { value: 'summary', label: 'Summary', icon: '📋', desc: 'Concise overview of the conversation' },
    { value: 'presentation', label: 'Presentation', icon: '📊', desc: 'Slide deck (PPTX)' },
    { value: 'code', label: 'Code Export', icon: '💻', desc: 'Extract code blocks only' },
  ];

  const formats: { value: DocFormat; label: string; available: boolean }[] = [
    { value: 'md', label: 'Markdown (.md)', available: true },
    { value: 'pdf', label: 'PDF (.pdf)', available: false },
    { value: 'pptx', label: 'PowerPoint (.pptx)', available: docType === 'presentation' },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress(10);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 90));
      }, 500);

      const response = await fetch(`${dashboardUrl}/api/chat/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.id,
          type: docType,
          format,
          options: {
            includeToolOutputs,
            includeContext,
          },
        }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        error: String(err),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (result?.path) {
      // In a real implementation, this would trigger a download
      window.open(`${dashboardUrl}/api/documents/download?path=${encodeURIComponent(result.path)}`, '_blank');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg m-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-600/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Generate Document</h2>
              <p className="text-sm text-gray-400">{conversation.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {!result ? (
            <>
              {/* Document Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Document Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {docTypes.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setDocType(type.value)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        docType === type.value
                          ? 'border-purple-500 bg-purple-900/30'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{type.icon}</span>
                        <span className="font-medium text-white">{type.label}</span>
                      </div>
                      <p className="text-xs text-gray-500">{type.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Output Format
                </label>
                <div className="flex gap-2">
                  {formats.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => f.available && setFormat(f.value)}
                      disabled={!f.available}
                      className={`px-4 py-2 rounded-lg text-sm transition-all ${
                        format === f.value
                          ? 'bg-purple-600 text-white'
                          : f.available
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">
                  Options
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeToolOutputs}
                    onChange={(e) => setIncludeToolOutputs(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-300">Include tool outputs</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeContext}
                    onChange={(e) => setIncludeContext(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-300">Include memory context</span>
                </label>
              </div>

              {/* Info */}
              <div className="p-3 bg-gray-900 rounded-lg text-sm text-gray-400">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Conversation contains:</span>
                </div>
                <ul className="ml-6 list-disc space-y-1">
                  <li>{conversation.messages.length} messages</li>
                  <li>{conversation.messages.filter(m => m.toolCalls?.length).length} tool executions</li>
                  <li>{conversation.messages.filter(m => m.attachments?.length).length} attachments</li>
                </ul>
              </div>
            </>
          ) : (
            /* Result View */
            <div className="py-6 text-center">
              {result.success ? (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-900/30 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">Document Generated!</h3>
                  {result.metadata && (
                    <p className="text-sm text-gray-400 mb-4">
                      {result.metadata.wordCount} words • {result.metadata.pages} pages
                    </p>
                  )}
                  <button
                    onClick={handleDownload}
                    className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
                  >
                    Download
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/30 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">Generation Failed</h3>
                  <p className="text-sm text-red-400 mb-4">{result.error}</p>
                  <button
                    onClick={() => setResult(null)}
                    className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex items-center justify-between p-4 border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                isGenerating
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
            >
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Generating... {progress}%
                </span>
              ) : (
                'Generate Document'
              )}
            </button>
          </div>
        )}

        {/* Progress Bar */}
        {isGenerating && (
          <div className="h-1 bg-gray-700">
            <motion.div
              className="h-full bg-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default DocumentGenerator;
