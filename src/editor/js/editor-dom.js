// editor-dom.js — DOM element references

const $ = (sel) => document.querySelector(sel);

export const btnPrev = $('#btn-prev');
export const btnNext = $('#btn-next');
export const slideCounter = $('#slide-counter');
export const slideStatusChip = $('#slide-status-chip');

export const slideIframe = $('#slide-iframe');
export const slidePanel = $('#slide-panel');
export const slideStage = $('#slide-stage');
export const slideWrapper = $('#slide-wrapper');
export const bboxLayer = $('#bbox-layer');
export const objectLayer = $('#object-layer');
export const objectHoverBox = $('#object-hover-box');
export const objectSelectedBox = $('#object-selected-box');
export const drawLayer = $('#draw-layer');
export const drawBox = $('#draw-box');
export const toolModeDrawBtn = $('#tool-mode-draw');
export const toolModeSelectBtn = $('#tool-mode-select');
export const bboxToolbar = $('#bbox-toolbar');
export const selectToolbar = $('#select-toolbar');

export const toggleBold = $('#toggle-bold');
export const toggleItalic = $('#toggle-italic');
export const toggleUnderline = $('#toggle-underline');
export const toggleStrike = $('#toggle-strike');
export const alignLeft = $('#align-left');
export const alignCenter = $('#align-center');
export const alignRight = $('#align-right');
export const popoverTextInput = $('#popover-text-input');
export const popoverApplyText = $('#popover-apply-text');
export const popoverTextColorInput = $('#popover-text-color-input');
export const popoverBgColorInput = $('#popover-bg-color-input');
export const popoverSizeInput = $('#popover-size-input');
export const popoverApplySize = $('#popover-apply-size');

export const chatMessagesEl = $('#chat-messages');
export const sessionFileChip = $('#session-file-chip');
export const contextChipList = $('#context-chip-list');
export const promptInput = $('#prompt-input');
export const modelSelect = $('#model-select');
export const btnClearBboxes = $('#btn-clear-bboxes');
export const bboxCountEl = $('#bbox-count');
export const btnSend = $('#btn-send');
export const editorHint = $('#editor-hint');
export const selectedObjectMini = $('#selected-object-mini');
export const miniTag = $('#mini-tag');
export const miniText = $('#mini-text');
export const selectEmptyHint = $('#select-empty-hint');

export const statusDot = $('#status-dot');
export const statusConn = $('#status-connection');
export const statusMsg = $('#status-message');

export const btnPdfExport = $('#btn-pdf-export');
export const btnSvgExport = $('#btn-svg-export');

export const btnFigmaExport = $('#btn-figma-export');
export const figmaConnDot = $('#figma-conn-dot');
export const figmaConfirmModal = $('#figma-confirm-modal');
export const figmaConfirmDesc = $('#figma-confirm-desc');
export const figmaConfirmActions = $('#figma-confirm-actions');
export const figmaProgress = $('#figma-progress');
export const figmaProgressFill = $('#figma-progress-fill');
export const figmaProgressText = $('#figma-progress-text');
export const figmaSendCurrent = $('#figma-send-current');
export const figmaSendAll = $('#figma-send-all');
export const figmaCancel = $('#figma-cancel');
export const figmaToast = $('#figma-toast');

export const creationPanel = $('#creation-panel');
export const creationTopic = $('#creation-topic');
export const creationRequirements = $('#creation-requirements');
export const creationModel = $('#creation-model');
export const creationGenerate = $('#creation-generate');
export const creationDeckName = null; // removed from Phase 1; deck name is now in outline phase
export const creationSlideCount = $('#creation-slide-count');
export const creationLog = $('#creation-log');
export const creationProgress = $('#creation-progress');
export const editorSidebar = $('#editor-sidebar');
export const btnNewDeck = $('#btn-new-deck');

// Phase 2+: Thumbnail strip
export const slideStrip = $('#slide-strip');

// Phase 3: Export dropdown
export const btnExportToggle = $('#btn-export-toggle');
export const exportDropdown = $('#export-dropdown');
export const btnReviewOutline = $('#btn-review-outline');
export const btnReviewDeck = $('#btn-review-deck');

// Phase 4: Loading skeleton, empty guide, shortcuts
export const slideSkeleton = $('#slide-skeleton');
export const bboxEmptyGuide = $('#bbox-empty-guide');
export const shortcutsModal = $('#shortcuts-modal');
export const shortcutsClose = $('#shortcuts-close');
export const btnShortcuts = $('#btn-shortcuts');

// Phase 6: Sidebar toggle
export const sidebarToggle = $('#sidebar-toggle');

// Run button label
export const btnSendLabel = $('#btn-send-label');

// Slide running overlay
export const slideRunningOverlay = $('#slide-running-overlay');
export const slideRunningText = $('#slide-running-text');

// Import MD tab
export const tabTopic = $('#tab-topic');
export const tabImport = $('#tab-import');
export const tabTopicPanel = $('#creation-tab-topic');
export const tabImportPanel = $('#creation-tab-import');
export const importDropzone = $('#import-dropzone');
export const importFileInput = $('#import-file-input');
export const importBrowse = $('#import-browse');
export const importFileList = $('#import-file-list');
export const importFileListItems = $('#import-file-list-items');
export const importAddMore = $('#import-add-more');
export const importSlideCount = $('#import-slide-count');
export const importResearchMode = $('#import-research-mode');
export const importModel = $('#import-model');
export const importSubmit = $('#import-submit');
export const importPrompt = $('#import-prompt');
export const importUrlInput = $('#import-url-input');
export const importUrlGo = $('#import-url-go');

// Theme toggle
export const themeToggle = $('#theme-toggle');

// Slide duplicate/delete
export const btnDuplicateSlide = $('#btn-duplicate-slide');
export const btnDeleteSlide = $('#btn-delete-slide');
export const deleteSlideModal = $('#delete-slide-modal');
export const deleteSlideName = $('#delete-slide-name');
export const deleteSlideCancel = $('#delete-slide-cancel');
export const deleteSlideConfirm = $('#delete-slide-confirm');

// Presentation mode
export const btnPresent = $('#btn-present');
