import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpen, Users, ClipboardList, Upload, CheckCircle2, TrendingUp,
  Brain, ChevronRight, ChevronLeft, Plus, Trash2, Pencil, Search,
  RefreshCw, AlertTriangle, GraduationCap, FileText, Eye, EyeOff,
  X, Send, Loader2, Sparkles, Target, ShieldCheck, ArrowUpRight,
  ArrowDownRight, Minus, LogOut, Layers, BarChart3, MessageCircle,
  Flag, Lock, UserPlus, Settings, KeyRound, Ban, CheckCircle, Info,
  Radio, PlayCircle, StopCircle, Clock, Paperclip, Wand2, Copy,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";

/* ============================== CONSTANTS ============================== */

const DB_KEY = "loop_learning_db_v3";
const GEMINI_MODEL = "gemini-3.6-flash";

const COLORS = {
  ink: "#1E2333", indigo: "#4338CA", indigoDeep: "#2C2A6B", teal: "#0D9488",
  amber: "#D97706", rose: "#DC2626", bg: "#F6F5F1", line: "#E4E2DA",
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const QUESTION_TYPES = [
  { id: "mcq", label: "MCQ", marks: 1 },
  { id: "tf", label: "True / False", marks: 1 },
  { id: "fill", label: "Fill in the Blanks", marks: 1 },
  { id: "short", label: "Short Answer", marks: 2 },
  { id: "q2", label: "2 Mark", marks: 2 },
  { id: "q3", label: "3 Mark", marks: 3 },
  { id: "q6", label: "6 Mark", marks: 6 },
];
const SUBJECTIVE_IDS = ["short", "q2", "q3", "q6"];

const emptyDB = () => ({
  teacherAccounts: [], classes: [], students: [], subjects: [],
  assessments: [], quizAttempts: [], practiceSessions: [], studentMaterials: [],
  officialAssessments: [],
  thresholds: { strong: 80, needsPractice: 50 },
});

function makeQuizCode(subjectName, existingCodes) {
  const prefix = (subjectName || "QUIZ").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase().padEnd(3, "X");
  let code; do { code = prefix + Math.floor(100 + Math.random() * 900); } while (existingCodes.has(code));
  return code;
}

/* ============================== STORAGE ============================== */

async function loadDB() {
  try {
    const response = await fetch("/api/db");
    if (!response.ok) throw new Error("Database unavailable");
    const data = await response.json();
    const db = { ...emptyDB(), ...(data.db || {}) };
    if (db.teacherAccounts.some((t) => t.username === "demo.teacher") && db.students.length < 6) { const expanded = await expandDemoWorkspace(db); await saveDB(expanded); return expanded; }
    return db;
  } catch (e) {
    try {
      const value = localStorage.getItem(DB_KEY); const db = value ? { ...emptyDB(), ...JSON.parse(value) } : emptyDB();
      if (db.teacherAccounts.some((t) => t.username === "demo.teacher") && db.students.length < 6) { const expanded = await expandDemoWorkspace(db); try { localStorage.setItem(DB_KEY, JSON.stringify(expanded)); } catch (storageError) { /* keep in memory */ } return expanded; }
      return db;
    }
    catch (storageError) { return emptyDB(); }
  }
}
async function saveDB(db) {
  try {
    const response = await fetch("/api/db", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ db }) });
    if (!response.ok) throw new Error("Database unavailable");
    return true;
  } catch (e) { console.error("Database error", e); return false; }
}
async function saveFile(id, fileObj) {
  try {
    const response = await fetch("/api/files", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, file: fileObj }) });
    return response.ok;
  } catch (e) { return false; }
}
async function getFile(id) {
  if (!id) return null;
  try {
    const response = await fetch("/api/files?id=" + encodeURIComponent(id));
    if (!response.ok) return null;
    return (await response.json()).file || null;
  } catch (e) { return null; }
}
function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mediaType: file.type || "application/octet-stream", data: r.result.split(",")[1] });
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

/* ============================== AUTH / HASHING ============================== */
// Client-side demo security: passwords are salted + SHA-256 hashed before storage —
// appropriate for a live prototype, not a substitute for a real server auth backend.

async function sha256Hex(str) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
const makeSalt = () => uid() + uid();
async function hashPassword(password, salt) { return sha256Hex(salt + "::" + password); }
async function verifyPassword(password, salt, hash) { return (await hashPassword(password, salt)) === hash; }

async function seedDemoWorkspace(db) {
  const teacherId = uid(); const classId = uid(); const mathsId = uid(); const scienceId = uid();
  const aliceId = uid(); const benId = uid(); const chapterOneId = uid(); const chapterTwoId = uid();
  const teacherSalt = makeSalt(); const studentSalt = makeSalt();
  const teacher = { id: teacherId, name: "Demo Teacher", username: "demo.teacher", salt: teacherSalt, passwordHash: await hashPassword("demo1234", teacherSalt) };
  const students = [
    { id: aliceId, name: "Alice Johnson", rollNo: "01", classId, username: "alice1", salt: studentSalt, passwordHash: await hashPassword("student123", studentSalt), disabled: false },
    { id: benId, name: "Ben Williams", rollNo: "02", classId, username: "ben1", salt: studentSalt, passwordHash: await hashPassword("student123", studentSalt), disabled: false },
  ];
  const questions = [
    { id: uid(), type: "mcq", marks: 1, topic: "Linear equations", difficulty: "easy", question: "Solve 2x + 5 = 13.", options: ["2", "4", "6", "9"], correctIndex: 1, explanation: "Subtract 5, then divide by 2." },
    { id: uid(), type: "mcq", marks: 1, topic: "Factorisation", difficulty: "medium", question: "Factorise x² - 9.", options: ["(x-3)(x+3)", "(x-9)(x+1)", "(x-3)²", "(x+9)(x-1)"], correctIndex: 0, explanation: "Use the difference of squares identity." },
    { id: uid(), type: "tf", marks: 1, topic: "Linear equations", difficulty: "easy", question: "The graph of y = 2x + 1 has gradient 2.", correctAnswer: true, explanation: "In y = mx + c, m is the gradient." },
    { id: uid(), type: "fill", marks: 1, topic: "Factorisation", difficulty: "medium", question: "The common factor of 6x and 9 is ____.", correctAnswer: "3", explanation: "Three divides both 6x and 9." },
  ];
  const makeAssessment = (id, chapter, createdAt) => ({ id, classId, subjectId: mathsId, subjectName: "Mathematics", chapter, topics: ["Linear equations", "Factorisation"], questionTypes: ["mcq", "tf", "fill"], difficulty: "Mixed", durationMinutes: 15, instructions: "Use this diagnostic to identify topics for practice.", questions, status: "closed", quizCode: null, createdAt });
  const assessmentOne = makeAssessment(chapterOneId, "Algebra Basics", "2026-08-20T09:00:00.000Z");
  const assessmentTwo = makeAssessment(chapterTwoId, "Algebra Review", "2026-09-01T09:00:00.000Z");
  const makeAttempt = (id, assessmentId, studentId, score, topics, submittedAt) => ({ id, assessmentId, studentId, status: "submitted", answers: { 0: score > 2 ? 1 : 0, 1: score > 3 ? 0 : 1, 2: score > 1, 3: score > 3 ? "3" : "6" }, score, maxScore: 4, topics, submittedAt });
  const strong = [{ topic: "Linear equations", percent: 100, ...classify(100, db.thresholds) }, { topic: "Factorisation", percent: 75, ...classify(75, db.thresholds) }];
  const mixed = [{ topic: "Linear equations", percent: 50, ...classify(50, db.thresholds) }, { topic: "Factorisation", percent: 25, ...classify(25, db.thresholds) }];
  const attempts = [
    makeAttempt(uid(), chapterOneId, aliceId, 3, mixed, "2026-08-21T09:30:00.000Z"),
    makeAttempt(uid(), chapterOneId, benId, 2, mixed, "2026-08-21T09:35:00.000Z"),
    makeAttempt(uid(), chapterTwoId, aliceId, 4, strong, "2026-09-02T09:30:00.000Z"),
    makeAttempt(uid(), chapterTwoId, benId, 3, mixed, "2026-09-02T09:35:00.000Z"),
  ];
  return {
    ...db,
    teacherAccounts: [...db.teacherAccounts, teacher],
    classes: [...db.classes, { id: classId, name: "10", section: "A", year: "2026", teacherId }],
    students: [...db.students, ...students],
    subjects: [...db.subjects, { id: mathsId, name: "Mathematics" }, { id: scienceId, name: "Science" }],
    assessments: [...db.assessments, assessmentOne, assessmentTwo],
    quizAttempts: [...db.quizAttempts, ...attempts],
    practiceSessions: [...db.practiceSessions,
      { id: uid(), studentId: aliceId, subject: "Mathematics", topic: "Linear equations", difficulty: "Medium", score: 3, total: 4, timestamp: "2026-08-25T10:00:00.000Z" },
      { id: uid(), studentId: aliceId, subject: "Mathematics", topic: "Factorisation", difficulty: "Easy", score: 4, total: 4, timestamp: "2026-09-03T10:00:00.000Z" },
    ],
  };
}

async function expandDemoWorkspace(db) {
  const demoTeacher = db.teacherAccounts.find((t) => t.username === "demo.teacher");
  const classRecord = db.classes.find((c) => c.teacherId === demoTeacher?.id) || db.classes[0];
  if (!demoTeacher || !classRecord) return db;
  const passwordSalt = makeSalt(); const passwordHash = await hashPassword("student123", passwordSalt);
  const names = [["Chloe Patel", "03", "chloe1"], ["Daniel Lee", "04", "daniel1"], ["Eva Martin", "05", "eva1"], ["Farah Khan", "06", "farah1"]];
  const addedStudents = names.map(([name, rollNo, username]) => ({ id: uid(), name, rollNo, classId: classRecord.id, username, salt: passwordSalt, passwordHash, disabled: false }));
  const students = [...db.students, ...addedStudents];
  const subjects = [...db.subjects];
  ["Science", "English", "Computer Science"].forEach((name) => { if (!subjects.some((s) => s.name === name)) subjects.push({ id: uid(), name }); });
  const mathsAssessments = db.assessments.filter((a) => a.classId === classRecord.id);
  const template = mathsAssessments[0];
  const extraAssessments = subjects.filter((s) => ["Science", "English"].includes(s.name) && !db.assessments.some((a) => a.subjectId === s.id)).map((subject, index) => ({ ...template, id: uid(), subjectId: subject.id, subjectName: subject.name, chapter: index === 0 ? "Forces and Energy" : "Reading and Writing", createdAt: `2026-08-${String(24 + index).padStart(2, "0")}T09:00:00.000Z` }));
  const allAssessments = [...db.assessments, ...extraAssessments];
  const assessmentPool = allAssessments.filter((a) => a.classId === classRecord.id);
  const attempts = [...db.quizAttempts];
  addedStudents.forEach((student, studentIndex) => assessmentPool.forEach((assessment, assessmentIndex) => {
    const score = Math.min(4, 1 + ((studentIndex + assessmentIndex) % 4));
    attempts.push({ id: uid(), assessmentId: assessment.id, studentId: student.id, status: "submitted", answers: {}, score, maxScore: 4, topics: [{ topic: "Linear equations", percent: score >= 3 ? 75 : 50, ...classify(score >= 3 ? 75 : 50, db.thresholds) }, { topic: "Factorisation", percent: score >= 3 ? 75 : 25, ...classify(score >= 3 ? 75 : 25, db.thresholds) }], submittedAt: `2026-09-${String(3 + studentIndex).padStart(2, "0")}T09:00:00.000Z` });
  }));
  return { ...db, students, subjects, assessments: allAssessments, quizAttempts: attempts };
}

/* ============================== AI CALLS ============================== */

function fileToContentBlock(fileObj) {
  if (!fileObj) return null;
  if (fileObj.mediaType === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileObj.data } };
  if (fileObj.mediaType && fileObj.mediaType.startsWith("image/")) return { type: "image", source: { type: "base64", media_type: fileObj.mediaType, data: fileObj.data } };
  return null;
}
async function callAI(system, userContentBlocks) {
  const response = await fetch("/api/claude", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: GEMINI_MODEL, max_tokens: 4096, system, messages: [{ role: "user", content: userContentBlocks }] }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "AI request failed (" + response.status + ")");
  return (data.content || []).map((b) => b.text || "").join("\n");
}
function extractJSON(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const objectStart = clean.indexOf("{"), arrayStart = clean.indexOf("[");
  const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  const end = start === arrayStart ? clean.lastIndexOf("]") : clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in AI response");
  return JSON.parse(clean.slice(start, end + 1));
}

function typeLabel(id) { return QUESTION_TYPES.find((t) => t.id === id)?.label || id; }

async function generateDiagnosticQuiz({ subject, chapter, topics, typeIds, numQuestions, difficulty, instructions }) {
  const objectiveTypes = typeIds.filter((t) => !SUBJECTIVE_IDS.includes(t));
  const subjectiveTypes = typeIds.filter((t) => SUBJECTIVE_IDS.includes(t));
  const marksAllowed = Array.from(new Set(subjectiveTypes.map((t) => QUESTION_TYPES.find((q) => q.id === t).marks)));
  const system =
    `You are creating a DIAGNOSTIC learning quiz (not an official exam) for a teacher to run live with a class, on ` +
    `${subject} — chapter "${chapter}". Cover these topics, distributing questions across them as evenly as reasonable: ` +
    `${topics.join("; ")}. Generate EXACTLY ${numQuestions} questions total. Use a mix of internal types: ` +
    `${objectiveTypes.map((t) => t === "mcq" ? "mcq" : t === "tf" ? "tf" : "fill").join(", ") || "none"}` +
    `${subjectiveTypes.length ? (objectiveTypes.length ? " and " : "") + "subjective (marks must be one of: " + marksAllowed.join("/") + ")" : ""}. ` +
    `Overall difficulty: ${difficulty}.` + (instructions ? ` Extra instruction from the teacher: ${instructions}.` : "") +
    ` Tag every question with the exact topic name it tests (from the list given) and its own difficulty (easy/medium/hard). ` +
    `For type mcq: 4 options, 0-based correctIndex. For tf: boolean correctAnswer. For fill: mark the blank as ____ in the ` +
    `question text and give exact correctAnswer text. For type subjective: give a concise modelAnswer and 2-4 short ` +
    `markingPoints. Every question needs a brief explanation. Respond with ONLY compact JSON, no markdown fences: ` +
    '{"questions": [{"type":"mcq"|"tf"|"fill"|"subjective","marks":number,"topic":string,"difficulty":"easy"|"medium"|"hard",' +
    '"question":string,"options"?:[string,string,string,string],"correctIndex"?:number,"correctAnswer"?:boolean|string,' +
    '"modelAnswer"?:string,"markingPoints"?:[string],"explanation":string}]}';
  const parsed = extractJSON(await callAI(system, [{ type: "text", text: "Generate the quiz now." }]));
  const result = Array.isArray(parsed) ? { questions: parsed } : parsed;
  return (result.questions || []).map((q) => ({ id: uid(), ...q }));
}

async function regenerateOneQuestion({ subject, chapter, topic, typeId, difficulty }) {
  const marks = QUESTION_TYPES.find((t) => t.id === typeId).marks;
  const internalType = typeId === "mcq" ? "mcq" : typeId === "tf" ? "tf" : typeId === "fill" ? "fill" : "subjective";
  const system =
    `Generate ONE diagnostic quiz question for ${subject} — chapter "${chapter}", topic "${topic}", type ${typeLabel(typeId)}, ` +
    `difficulty ${difficulty}, worth ${marks} mark(s). Use the same JSON field rules as a normal quiz question of this type. ` +
    'Respond with ONLY compact JSON, no markdown fences: {"question": {"type":"' + internalType + '","marks":' + marks +
    ',"topic":"' + topic + '","difficulty":"' + difficulty + '","question":string,"options"?:[string,string,string,string],' +
    '"correctIndex"?:number,"correctAnswer"?:boolean|string,"modelAnswer"?:string,"markingPoints"?:[string],"explanation":string}}';
  const result = extractJSON(await callAI(system, [{ type: "text", text: "Generate it now." }]));
  return { id: uid(), ...result.question };
}

async function evaluateSubjectiveAnswers(items) {
  const system =
    "You are grading a student's DIAGNOSTIC quiz answers — an AI-generated learning insight the teacher reviews, not an " +
    "automatic final grade. For each question, award marks out of its stated maximum using the model answer / marking " +
    "points as reference, giving partial credit where appropriate. In a friendly tutor voice explain: what was correct, " +
    "what was missing, the likely misunderstood concept, and one thing to practise next. Respond with ONLY compact JSON, " +
    'no markdown fences: {"evaluations": [{"marksAwarded": number, "whatWasCorrect": string, "whatWasMissing": string, ' +
    '"misunderstoodConcept": string, "nextPractice": string}]} in the same order given. Keep fields under 18 words.';
  const result = extractJSON(await callAI(system, [{ type: "text", text: JSON.stringify(items) }]));
  return result.evaluations || [];
}

async function askDoubt({ subject, topic, question, materials }) {
  const system =
    "You are Loop Learning AI's Personal AI Tutor — a warm, encouraging assistant. You never claim to replace the " +
    "teacher. Prioritise any provided study material; if you lack reliable information, say so plainly. Decide if a " +
    "visual would genuinely help: type is one of none/steps/table/graph/diagram. Use 'diagram' for a simple geometry " +
    "figure or labelled process diagram, described as SVG-style primitives (points with x,y in a 0-300 by 0-200 box, " +
    "lines connecting point ids, optional simple shapes). Use 'graph' for a mathematical/economic curve as 6-12 sample " +
    "{x,y} points. You can only produce rendered diagrams/graphs/tables/flowcharts — never claim to attach a real " +
    "photograph or illustration; if a photo is genuinely what's needed, say that isn't available here. Respond with " +
    'ONLY compact JSON, no markdown fences: {"explanation": string (under 140 words), "visual": {"type": ' +
    '"none"|"steps"|"table"|"graph"|"diagram", "title": string, "steps"?: [string], "table"?: {"headers":[string],' +
    '"rows":[[string]]}, "points"?: [{"x":number,"y":number}], "axisLabel"?: string, "diagram"?: {"viewBox": string, ' +
    '"points": [{"id":string,"x":number,"y":number,"label":string}], "lines": [{"from":string,"to":string}], ' +
    '"shapes"?: [{"kind":"circle"|"rect","x":number,"y":number,"r"?:number,"w"?:number,"h"?:number}]}}';
  const blocks = [{ type: "text", text: `Subject: ${subject || "General"}\nTopic focus: ${topic || "General"}\nStudent's message: ${question}` }];
  (materials || []).forEach((m) => { const b = fileToContentBlock(m); if (b) { blocks.push({ type: "text", text: "Uploaded study material:" }); blocks.push(b); } });
  return extractJSON(await callAI(system, blocks));
}

async function generatePracticeQuiz({ subject, chapter, topic, difficulty, spec }) {
  const composition = spec.map((s) => `${s.count} ${typeLabel(s.id)} question(s) worth ${QUESTION_TYPES.find((q) => q.id === s.id).marks} mark(s) each`).join("; ");
  const system =
    `You are generating a private personal-practice quiz for one student on "${topic}"${chapter ? ` (chapter: ${chapter})` : ""} in ${subject}, difficulty ${difficulty}. ` +
    "Use standard reliable curriculum knowledge for this topic — never invent facts. " +
    `Generate EXACTLY this composition: ${composition}. ` +
    "For mcq: 4 options + 0-based correctIndex. For tf: boolean correctAnswer. For fill: blank as ____ + exact correctAnswer. " +
    "For subjective: concise modelAnswer + 2-4 short markingPoints. For every question, provide a worked step-by-step solution " +
    "showing how to solve it, with each step as a short numbered instruction; do not merely state the answer. Respond with " +
    'ONLY compact JSON, no markdown fences: {"questions": [{"type":"mcq"|"tf"|"fill"|"subjective","marks":number,' +
    '"question":string,"options"?:[string,string,string,string],"correctIndex"?:number,"correctAnswer"?:boolean|string,' +
    '"modelAnswer"?:string,"markingPoints"?:[string],"explanation":string,"solutionSteps":[string]}]}';
  const parsed = extractJSON(await callAI(system, [{ type: "text", text: "Generate the quiz now." }]));
  return Array.isArray(parsed) ? { questions: parsed } : parsed;
}

function isAIReadable(fileMeta) { return !!fileMeta && (fileMeta.mediaType === "application/pdf" || (fileMeta.mediaType || "").startsWith("image/")); }

async function evaluateAnswerSheetAI({ subject, chapter, maxMarks, questionPaper, answerKey, reference, answerSheet }) {
  const system =
    "You are producing an AI INITIAL EVALUATION of one student's answer sheet, for a teacher to verify — this is never " +
    `an official grade until a teacher approves it. Subject: ${subject}. Chapter/topic: ${chapter || "General"}. Total ` +
    `marks for this assessment: ${maxMarks}. You are given, in this order: the question paper, the answer key, optional ` +
    "reference material, then the student's answer sheet. Read them carefully. For EACH question in the question paper, " +
    "briefly summarise (do not quote verbatim) the student's actual answer from their sheet, compare it to the expected " +
    "answer in the answer key, assign suggested marks never exceeding that question's max, tag the topic it tests, note " +
    "brief feedback, and flag any likely learning difficulty. If a question was not attempted, say so and award 0. Keep " +
    "every text field under 16 words. Respond with ONLY compact JSON, no markdown fences: " +
    '{"questions": [{"questionNumber": number, "questionText": string, "maxMarks": number, "topic": string, ' +
    '"studentAnswerSummary": string, "expectedAnswerSummary": string, "aiMarks": number, "feedback": string, ' +
    '"learningDifficulty": string}], "totalAiMarks": number, "overallFeedback": string}';
  const blocks = [{ type: "text", text: "QUESTION PAPER:" }, fileToContentBlock(questionPaper), { type: "text", text: "ANSWER KEY:" }, fileToContentBlock(answerKey)].filter(Boolean);
  if (reference) { const rf = fileToContentBlock(reference); if (rf) blocks.push({ type: "text", text: "REFERENCE MATERIAL:" }, rf); }
  const asBlock = fileToContentBlock(answerSheet);
  blocks.push({ type: "text", text: "STUDENT ANSWER SHEET:" }, asBlock, { type: "text", text: "Evaluate now." });
  return extractJSON(await callAI(system, blocks.filter(Boolean)));
}

/* ============================== GRADING (programmatic) ============================== */

function classify(percent, thresholds) {
  if (percent >= thresholds.strong) return { label: "Strong", color: COLORS.teal, bg: "#CCFBEF", dot: "🟢" };
  if (percent >= thresholds.needsPractice) return { label: "Needs Practice", color: COLORS.amber, bg: "#FEF3C7", dot: "🟡" };
  return { label: "Priority", color: COLORS.rose, bg: "#FEE2E2", dot: "🔴" };
}
function gradeQuestion(q, ans) {
  if (q.type === "mcq") return ans === q.correctIndex ? q.marks : 0;
  if (q.type === "tf") return ans === q.correctAnswer ? q.marks : 0;
  if (q.type === "fill") return String(ans || "").trim().toLowerCase() === String(q.correctAnswer || "").trim().toLowerCase() ? q.marks : 0;
  return 0;
}
function gradeAttempt(questions, answers, subjectiveEvals, thresholds) {
  let score = 0, maxScore = 0; const topicMap = {};
  questions.forEach((q, i) => {
    maxScore += q.marks;
    const got = q.type === "subjective" ? (subjectiveEvals[i]?.marksAwarded ?? 0) : gradeQuestion(q, answers[i]);
    score += got;
    if (!topicMap[q.topic]) topicMap[q.topic] = { got: 0, max: 0 };
    topicMap[q.topic].got += got; topicMap[q.topic].max += q.marks;
  });
  const topics = Object.entries(topicMap).map(([topic, v]) => { const percent = v.max ? Math.round((v.got / v.max) * 100) : 0; return { topic, percent, ...classify(percent, thresholds) }; });
  return { score, maxScore, topics };
}
function classroomInsight(topicStats) {
  const gap = topicStats.find((t) => t.pct >= 50);
  if (gap) return `🔴 ${gap.topic} is the major classroom learning gap — ${gap.needing} of ${gap.total} students require additional support.`;
  return "No major classroom-wide learning gap detected in this data yet.";
}

/* ============================== SMALL UI PARTS ============================== */

function Ring({ percent, size = 56, stroke = 6, color }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (Math.max(0, Math.min(100, percent)) / 100) * c;
  return (<svg width={size} height={size} className="shrink-0"><circle cx={size / 2} cy={size / 2} r={r} stroke="#EAE8E1" strokeWidth={stroke} fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 0.6s ease" }} /><text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size * 0.26} fontWeight="700" fill={COLORS.ink}>{Math.round(percent)}%</text></svg>);
}
function Badge({ children, tone = "neutral" }) {
  const tones = { neutral: "bg-stone-100 text-stone-600 border-stone-200", indigo: "bg-indigo-50 text-indigo-700 border-indigo-200", teal: "bg-teal-50 text-teal-700 border-teal-200", amber: "bg-amber-50 text-amber-700 border-amber-200", rose: "bg-rose-50 text-rose-700 border-rose-200" };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tones[tone]}`}>{children}</span>;
}
function Card({ children, className = "" }) { return <div className={`bg-white border border-stone-200 rounded-2xl shadow-sm ${className}`}>{children}</div>; }
function PrimaryButton({ children, onClick, disabled, icon: Icon, className = "" }) { return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-700 text-white text-sm font-semibold hover:bg-indigo-800 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>{Icon && <Icon size={16} />}{children}</button>; }
function GhostButton({ children, onClick, icon: Icon, className = "", danger }) { return <button onClick={onClick} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-stone-200 text-stone-600 hover:bg-stone-50"} ${className}`}>{Icon && <Icon size={14} />}{children}</button>; }
function TextInput(props) { return <input {...props} className={`w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 ${props.className || ""}`} />; }
function Select(props) { return <select {...props} className={`w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 ${props.className || ""}`} />; }
function PasswordInput({ value, onChange, placeholder }) { const [show, setShow] = useState(false); return (<div className="relative"><input type={show ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} className="w-full px-3 py-2 pr-10 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" /><button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600" tabIndex={-1}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>); }
function FileDrop({ label, file, onFile, accept = ".pdf,.jpg,.jpeg,.png", optional }) { const inputRef = useRef(); return (<div><div className="text-xs font-semibold text-stone-500 mb-1">{label}{optional && <span className="font-normal text-stone-400"> (optional)</span>}</div><div onClick={() => inputRef.current.click()} className="cursor-pointer border-2 border-dashed border-stone-300 rounded-xl px-3 py-3 flex items-center gap-2 hover:border-indigo-400 hover:bg-indigo-50/40 transition text-sm"><Upload size={16} className="text-stone-400" /><span className={file ? "text-stone-700 font-medium truncate" : "text-stone-400"}>{file ? file.name : "Click to upload PDF / JPG / PNG"}</span></div><input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} /></div>); }
function Modal({ title, onClose, children }) { return (<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}><div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-4"><div className="font-bold text-stone-800">{title}</div><X size={18} className="cursor-pointer text-stone-400 hover:text-stone-600" onClick={onClose} /></div>{children}</div></div>); }
function EmptyHint({ text, action, actionLabel }) { return <div className="text-center py-8 text-sm text-stone-400"><div className="mb-3">{text}</div>{action && <GhostButton onClick={action}>{actionLabel}</GhostButton>}</div>; }
function trendOf(scores) {
  if (scores.length < 2) return { label: "Not enough data yet", icon: Minus, color: COLORS.ink };
  const diff = scores[scores.length - 1] - scores[0];
  if (diff >= 8) return { label: `Improving (+${diff.toFixed(0)} pts since first)`, icon: ArrowUpRight, color: COLORS.teal };
  if (diff <= -8) return { label: `Persistent difficulty (${diff.toFixed(0)} pts since first)`, icon: ArrowDownRight, color: COLORS.rose };
  const recent = scores[scores.length - 1] - scores[scores.length - 2];
  if (recent >= 6) return { label: "Recent improvement", icon: ArrowUpRight, color: COLORS.teal };
  return { label: "Stable", icon: Minus, color: COLORS.amber };
}

/* ---------- visual explanation components ---------- */

function StepsVisual({ title, steps }) { return (<div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 mt-2">{title && <div className="text-xs font-bold text-indigo-800 mb-2">{title}</div>}{steps.map((s, i) => (<div key={i} className="flex gap-2"><div className="flex flex-col items-center"><div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</div>{i < steps.length - 1 && <div className="w-px flex-1 bg-indigo-200 my-0.5" />}</div><div className="text-xs text-stone-700 pb-3">{s}</div></div>))}</div>); }
function TableVisual({ title, table }) { return (<div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 mt-2 overflow-auto">{title && <div className="text-xs font-bold text-indigo-800 mb-2">{title}</div>}<table className="text-xs w-full"><thead><tr>{table.headers.map((h, i) => <th key={i} className="text-left font-semibold text-stone-600 border-b border-indigo-200 pb-1 pr-3">{h}</th>)}</tr></thead><tbody>{table.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="pr-3 py-1 text-stone-700 border-b border-indigo-100">{cell}</td>)}</tr>)}</tbody></table></div>); }
function GraphVisual({ title, points, axisLabel }) { return (<div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 mt-2">{title && <div className="text-xs font-bold text-indigo-800 mb-2">{title}</div>}<div style={{ width: "100%", height: 160 }}><ResponsiveContainer><LineChart data={points}><CartesianGrid strokeDasharray="3 3" stroke="#E0DEF7" /><XAxis dataKey="x" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} label={axisLabel ? { value: axisLabel, fontSize: 10, position: "insideLeft" } : undefined} /><Tooltip /><Line type="monotone" dataKey="y" stroke={COLORS.indigo} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></div>); }
function DiagramVisual({ title, diagram }) {
  const byId = Object.fromEntries((diagram.points || []).map((p) => [p.id, p]));
  return (<div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 mt-2">{title && <div className="text-xs font-bold text-indigo-800 mb-2">{title}</div>}
    <svg viewBox={diagram.viewBox || "0 0 300 200"} width="100%" height="170">
      {(diagram.lines || []).map((l, i) => { const a = byId[l.from], b = byId[l.to]; if (!a || !b) return null; return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.indigo} strokeWidth="2" />; })}
      {(diagram.shapes || []).map((s, i) => s.kind === "circle" ? <circle key={i} cx={s.x} cy={s.y} r={s.r || 20} fill="none" stroke={COLORS.teal} strokeWidth="2" /> : <rect key={i} x={s.x} y={s.y} width={s.w || 40} height={s.h || 30} fill="none" stroke={COLORS.teal} strokeWidth="2" />)}
      {(diagram.points || []).map((p, i) => (<g key={i}><circle cx={p.x} cy={p.y} r="3" fill={COLORS.indigoDeep} /><text x={p.x + 6} y={p.y - 6} fontSize="10" fill={COLORS.ink}>{p.label || p.id}</text></g>))}
    </svg></div>);
}
function VisualBlock({ visual }) {
  if (!visual || visual.type === "none") return null;
  if (visual.type === "steps" && visual.steps?.length) return <StepsVisual title={visual.title} steps={visual.steps} />;
  if (visual.type === "table" && visual.table) return <TableVisual title={visual.title} table={visual.table} />;
  if (visual.type === "graph" && visual.points?.length) return <GraphVisual title={visual.title} points={visual.points} axisLabel={visual.axisLabel} />;
  if (visual.type === "diagram" && visual.diagram) return <DiagramVisual title={visual.title} diagram={visual.diagram} />;
  return null;
}

/* ============================== APP ROOT ============================== */

export default function App() {
  const [db, setDbState] = useState(null);
  const [session, setSession] = useState(null);
  useEffect(() => { loadDB().then(setDbState); }, []);
  const persist = useCallback(async (next) => { setDbState(next); await saveDB(next); }, []);
  const refresh = useCallback(async () => { const fresh = await loadDB(); setDbState(fresh); return fresh; }, []);

  if (!db) return <div className="min-h-[500px] flex items-center justify-center" style={{ background: COLORS.bg }}><Loader2 className="animate-spin text-indigo-600" size={28} /></div>;
  if (!session) return <AuthGate db={db} setDb={persist} onLogin={setSession} />;

  if (session.type === "teacher") {
    const teacher = db.teacherAccounts.find((t) => t.id === session.id);
    if (!teacher) { setSession(null); return null; }
    return <TeacherApp db={db} setDb={persist} refresh={refresh} teacher={teacher} onExit={() => setSession(null)} />;
  }
  const student = db.students.find((s) => s.id === session.id);
  if (!student || student.disabled) { setSession(null); return null; }
  return <StudentApp db={db} setDb={persist} refresh={refresh} studentId={student.id} onExit={() => setSession(null)} />;
}

function LoopLogo({ size = 22 }) { return <RefreshCw size={size} className="text-indigo-700 shrink-0" strokeWidth={2.4} />; }
function LoopSteps() { const steps = ["Assess", "Analyse", "Improve", "Reassess"]; return (<div className="flex items-center gap-1.5 flex-wrap justify-center">{steps.map((s, i) => (<React.Fragment key={s}><span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: i % 2 === 0 ? "#EEF2FF" : "#CCFBEF", color: i % 2 === 0 ? COLORS.indigo : COLORS.teal }}>{s}</span>{i < steps.length - 1 && <ChevronRight size={13} className="text-stone-300" />}</React.Fragment>))}</div>); }

/* ============================== AUTH ============================== */

function AuthGate({ db, setDb, onLogin }) {
  const [mode, setMode] = useState("teacher");
  return (
    <div className="min-h-[600px] flex flex-col items-center justify-center px-6 py-12" style={{ background: COLORS.bg }}>
      <div className="flex items-center gap-2 mb-2"><LoopLogo size={26} /><span className="text-2xl font-black tracking-tight text-indigo-950">Loop Learning AI</span></div>
      <div className="mb-6"><LoopSteps /></div>
      <div className="flex gap-1 bg-stone-200/60 p-1 rounded-xl mb-5">
        <button onClick={() => setMode("teacher")} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${mode === "teacher" ? "bg-white shadow-sm text-indigo-700" : "text-stone-500"}`}>Teacher</button>
        <button onClick={() => setMode("student")} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${mode === "student" ? "bg-white shadow-sm text-teal-700" : "text-stone-500"}`}>Student</button>
      </div>
      {mode === "teacher" ? <TeacherAuth db={db} setDb={setDb} onLogin={onLogin} /> : <StudentAuth db={db} onLogin={onLogin} />}
    </div>
  );
}

function TeacherAuth({ db, setDb, onLogin }) {
  const [creating, setCreating] = useState(db.teacherAccounts.length === 0);
  const [name, setName] = useState(""); const [username, setUsername] = useState("");
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const createAccount = async () => {
    setError("");
    if (!name.trim() || !username.trim() || password.length < 4) { setError("Fill in your name, a username, and a password of at least 4 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (db.teacherAccounts.some((t) => t.username.toLowerCase() === username.trim().toLowerCase())) { setError("That username is already taken."); return; }
    setBusy(true); const salt = makeSalt(); const passwordHash = await hashPassword(password, salt);
    const account = { id: uid(), name: name.trim(), username: username.trim(), salt, passwordHash };
    await setDb({ ...db, teacherAccounts: [...db.teacherAccounts, account] }); setBusy(false);
    onLogin({ type: "teacher", id: account.id });
  };
  const login = async () => {
    setError("");
    const account = db.teacherAccounts.find((t) => t.username.toLowerCase() === username.trim().toLowerCase());
    if (!account) { setError("No teacher account with that username."); return; }
    setBusy(true); const ok = await verifyPassword(password, account.salt, account.passwordHash); setBusy(false);
    if (!ok) { setError("Incorrect password."); return; }
    onLogin({ type: "teacher", id: account.id });
  };
  return (
    <Card className="p-6 w-full max-w-sm space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-stone-700"><GraduationCap size={17} className="text-indigo-700" />{creating ? "Create Teacher Account" : "Teacher Login"}</div>
      {creating && <TextInput placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />}
      <TextInput placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <PasswordInput placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {creating && <PasswordInput placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      {error && <div className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} />{error}</div>}
      <PrimaryButton className="w-full justify-center" icon={busy ? Loader2 : (creating ? UserPlus : Lock)} disabled={busy} onClick={creating ? createAccount : login}>{creating ? "Create Account & Log In" : "Log In"}</PrimaryButton>
      {db.teacherAccounts.length > 0 && <button onClick={() => { setCreating((c) => !c); setError(""); }} className="w-full text-center text-xs text-stone-400 hover:text-indigo-600">{creating ? "Already have an account? Log in" : "New teacher? Create an account"}</button>}
    </Card>
  );
}
function StudentAuth({ db, onLogin }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const login = async () => {
    setError("");
    const student = db.students.find((s) => s.username && s.username.toLowerCase() === username.trim().toLowerCase());
    if (!student) { setError("No student account with that username. Ask your teacher to set one up."); return; }
    if (student.disabled) { setError("This account has been disabled by your teacher."); return; }
    setBusy(true); const ok = await verifyPassword(password, student.salt, student.passwordHash); setBusy(false);
    if (!ok) { setError("Incorrect password."); return; }
    onLogin({ type: "student", id: student.id });
  };
  return (
    <Card className="p-6 w-full max-w-sm space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-stone-700"><Users size={17} className="text-teal-700" />Student Login</div>
      <TextInput placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <PasswordInput placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <div className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle size={12} />{error}</div>}
      <PrimaryButton className="w-full justify-center bg-teal-700 hover:bg-teal-800" icon={busy ? Loader2 : Lock} disabled={busy} onClick={login}>Log In</PrimaryButton>
      <div className="text-xs text-stone-400 text-center">Your teacher creates and manages your login.</div>
    </Card>
  );
}

/* ============================== SIDEBAR ============================== */

function Sidebar({ nav, tab, setTab, onExit, title, subtitle, onAccount }) {
  return (
    <div className="w-60 shrink-0 bg-indigo-950 text-indigo-100 flex flex-col">
      <div className="px-5 py-5 border-b border-indigo-900 flex items-center gap-2"><RefreshCw size={20} className="text-teal-300" /><div><div className="text-sm font-black text-white leading-none">{subtitle}</div><div className="text-[11px] text-indigo-300 truncate max-w-[150px]">{title}</div></div></div>
      <div className="flex-1 py-3 px-2 space-y-0.5">{nav.map((n) => (<button key={n.id} onClick={() => setTab(n.id)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${tab === n.id ? "bg-indigo-800 text-white" : "text-indigo-200 hover:bg-indigo-900"}`}><n.icon size={16} /><span className="flex-1 text-left">{n.label}</span>{!!n.badge && <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{n.badge}</span>}</button>))}</div>
      <button onClick={onAccount} className="mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-indigo-300 hover:bg-indigo-900"><Settings size={15} /> Account</button>
      <button onClick={onExit} className="mx-3 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-indigo-300 hover:bg-indigo-900"><LogOut size={15} /> Log out</button>
    </div>
  );
}
function ChangePasswordModal({ onClose, verifyFn, saveFn }) {
  const [oldPw, setOldPw] = useState(""); const [newPw, setNewPw] = useState(""); const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const submit = async () => {
    setError("");
    if (newPw.length < 4) { setError("New password must be at least 4 characters."); return; }
    if (newPw !== confirm) { setError("New passwords do not match."); return; }
    setBusy(true); const ok = await verifyFn(oldPw);
    if (!ok) { setBusy(false); setError("Current password is incorrect."); return; }
    await saveFn(newPw); setBusy(false); setDone(true);
  };
  return (<Modal title="Change Password" onClose={onClose}>{done ? <div className="text-sm text-teal-700 flex items-center gap-2"><CheckCircle2 size={16} />Password updated.</div> : (<div className="space-y-2"><PasswordInput placeholder="Current password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} /><PasswordInput placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /><PasswordInput placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />{error && <div className="text-xs text-rose-600">{error}</div>}<PrimaryButton className="w-full justify-center" icon={busy ? Loader2 : KeyRound} disabled={busy} onClick={submit}>Update Password</PrimaryButton></div>)}</Modal>);
}

/* ============================== TEACHER APP ============================== */

function TeacherApp({ db, setDb, refresh, teacher, onExit }) {
  const [tab, setTab] = useState("overview");
  const [showAccount, setShowAccount] = useState(false);
  const [openAssessmentId, setOpenAssessmentId] = useState(null);

  const myClasses = db.classes.filter((c) => c.teacherId === teacher.id);
  const myClassIds = new Set(myClasses.map((c) => c.id));
  const myStudents = db.students.filter((s) => myClassIds.has(s.classId));
  const myAssessments = db.assessments.filter((a) => myClassIds.has(a.classId));
  const myAssessmentIds = new Set(myAssessments.map((a) => a.id));
  const myAttempts = db.quizAttempts.filter((a) => myAssessmentIds.has(a.assessmentId));
  const liveCount = myAssessments.filter((a) => a.status === "live").length;
  const scope = { teacherId: teacher.id, classes: myClasses, students: myStudents, assessments: myAssessments, quizAttempts: myAttempts };

  const nav = [
    { id: "overview", label: "Dashboard", icon: BarChart3 },
    { id: "assessment", label: "Assessment", icon: FileText },
    { id: "classes", label: "Classes & Students", icon: Users },
    { id: "subjects", label: "Subjects", icon: BookOpen },
    { id: "creator", label: "Create AI Quiz", icon: Wand2 },
    { id: "live", label: "Live Quizzes", icon: Radio, badge: liveCount },
    { id: "previous", label: "Previous Assessments", icon: ClipboardList },
    { id: "analysis", label: "Classroom Learning Analysis", icon: Layers },
    { id: "students", label: "Student Profiles", icon: GraduationCap },
    { id: "settings", label: "Settings", icon: ShieldCheck },
  ];
  const jumpTo = (id) => { setOpenAssessmentId(id); setTab("previous"); };

  return (
    <div className="min-h-[640px] flex" style={{ background: COLORS.bg }}>
      <Sidebar nav={nav} tab={tab} setTab={setTab} onExit={onExit} title={teacher.name} subtitle="Loop Learning AI · Teacher" onAccount={() => setShowAccount(true)} />
      <div className="flex-1 p-6 overflow-auto max-h-[900px]">
        {tab === "overview" && <TeacherOverview db={db} scope={scope} setTab={setTab} />}
        {tab === "assessment" && <OfficialAssessments db={db} setDb={setDb} scope={scope} />}
        {tab === "classes" && <ClassesStudents db={db} setDb={setDb} scope={scope} />}
        {tab === "subjects" && <Subjects db={db} setDb={setDb} />}
        {tab === "creator" && <QuizCreator db={db} setDb={setDb} scope={scope} onCreated={jumpTo} />}
        {tab === "live" && <LiveQuizzesList db={db} setDb={setDb} scope={scope} refresh={refresh} onOpen={jumpTo} />}
        {tab === "previous" && <PreviousAssessments db={db} setDb={setDb} scope={scope} refresh={refresh} openAssessmentId={openAssessmentId} onConsumeOpen={() => setOpenAssessmentId(null)} />}
        {tab === "analysis" && <ClassroomLearningAnalysis db={db} scope={scope} />}
        {tab === "students" && <StudentProfilesTeacher db={db} scope={scope} />}
        {tab === "settings" && <SettingsPanel db={db} setDb={setDb} />}
      </div>
      {showAccount && <ChangePasswordModal onClose={() => setShowAccount(false)} verifyFn={(pw) => verifyPassword(pw, teacher.salt, teacher.passwordHash)} saveFn={async (pw) => { const salt = makeSalt(); const passwordHash = await hashPassword(pw, salt); await setDb({ ...db, teacherAccounts: db.teacherAccounts.map((t) => t.id === teacher.id ? { ...t, salt, passwordHash } : t) }); }} />}
    </div>
  );
}

function TeacherOverview({ db, scope, setTab }) {
  const submitted = scope.quizAttempts.filter((a) => a.status === "submitted");
  const avg = submitted.length ? submitted.reduce((s, a) => s + (a.score / a.maxScore) * 100, 0) / submitted.length : 0;
  const topicMap = {};
  submitted.forEach((attempt) => (attempt.topics || []).forEach((topic) => { topicMap[topic.topic] ||= []; topicMap[topic.topic].push(topic.percent); }));
  const topicData = Object.entries(topicMap).map(([topic, values]) => ({ topic, average: Math.round(values.reduce((a, b) => a + b, 0) / values.length) })).sort((a, b) => a.average - b.average);
  const weakestTopic = topicData[0]; const needingSupport = new Set(submitted.filter((attempt) => (attempt.score / attempt.maxScore) * 100 < db.thresholds.needsPractice).map((attempt) => attempt.studentId)).size;
  const recent = [...scope.assessments].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);
  const stat = (label, value, icon, color) => (<Card className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + "20" }}>{React.createElement(icon, { size: 18, style: { color } })}</div><div><div className="text-xl font-black text-stone-800">{value}</div><div className="text-xs text-stone-500">{label}</div></div></Card>);
  return (
    <div className="space-y-5 max-w-5xl">
      <div><div className="flex items-center gap-2 mb-1"><h1 className="text-2xl font-black text-stone-800">Classroom overview</h1><Badge tone="teal">Live learning view</Badge></div><p className="text-stone-500 text-sm">See where the class is progressing, then move directly into targeted practice.</p></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stat("Students", scope.students.length, Users, COLORS.indigo)}
        {stat("Need support", needingSupport || "—", AlertTriangle, COLORS.rose)}
        {stat("Assessments", scope.assessments.length, ClipboardList, COLORS.teal)}
        {stat("Class average", submitted.length ? Math.round(avg) + "%" : "—", TrendingUp, COLORS.amber)}
      </div>
      {weakestTopic && <Card className="p-4 border-rose-200 bg-rose-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-rose-700">Recommended teaching move</div><div className="text-sm text-rose-900 mt-1">Revisit <b>{weakestTopic.topic}</b> first. The class is averaging {weakestTopic.average}% here.</div></div><GhostButton icon={Layers} onClick={() => setTab("analysis")} className="self-start sm:self-auto border-rose-200 text-rose-700">Open learning analysis</GhostButton></Card>}
      <TeacherPerformanceCharts db={db} scope={scope} />
      <Card className="p-5">
        <div className="font-bold text-stone-700 mb-3 text-sm">Recent assessments</div>
        {recent.length === 0 && <EmptyHint text="No assessments yet. Create a class and students, then generate your first AI quiz." action={() => setTab("classes")} actionLabel="Create a class" />}
        <div className="divide-y divide-stone-100">{recent.map((a) => (<div key={a.id} className="py-2.5 flex items-center justify-between text-sm"><div><div className="font-semibold text-stone-700">{a.subjectName || db.subjects.find((s) => s.id === a.subjectId)?.name} — {a.chapter}</div><div className="text-xs text-stone-400">{a.questions.length} questions</div></div><Badge tone={a.status === "live" ? "rose" : a.status === "closed" ? "teal" : "amber"}>{a.status === "live" ? "Live" : a.status === "closed" ? "Closed" : "Draft"}</Badge></div>))}</div>
      </Card>
      <div className="grid sm:grid-cols-4 gap-3">
        <QuickAction icon={FileText} label="New Assessment" onClick={() => setTab("assessment")} />
        <QuickAction icon={Users} label="Add Student" onClick={() => setTab("classes")} />
        <QuickAction icon={Wand2} label="Create AI Quiz" onClick={() => setTab("creator")} />
        <QuickAction icon={Layers} label="Classroom Learning Analysis" onClick={() => setTab("analysis")} />
      </div>
    </div>
  );
}
function TeacherPerformanceCharts({ db, scope }) {
  const subjectMap = {}; const studentMap = {};
  scope.quizAttempts.filter((a) => a.status === "submitted").forEach((attempt) => {
    const assessment = db.assessments.find((item) => item.id === attempt.assessmentId);
    const student = scope.students.find((item) => item.id === attempt.studentId);
    if (assessment) { subjectMap[assessment.subjectName] ||= []; subjectMap[assessment.subjectName].push((attempt.score / attempt.maxScore) * 100); }
    if (student) { studentMap[student.name] ||= []; studentMap[student.name].push((attempt.score / attempt.maxScore) * 100); }
  });
  const subjectData = Object.entries(subjectMap).map(([subject, values]) => ({ subject, average: Math.round(values.reduce((a, b) => a + b, 0) / values.length) }));
  const studentData = Object.entries(studentMap).map(([student, values]) => ({ student: student.split(" ")[0], average: Math.round(values.reduce((a, b) => a + b, 0) / values.length) }));
  if (!subjectData.length && !studentData.length) return null;
  return (<div className="grid lg:grid-cols-2 gap-4">
    <Card className="p-4"><div className="font-bold text-stone-700 text-sm mb-1">Overall performance by subject</div><div className="text-xs text-stone-400 mb-3">Average diagnostic score across the class.</div><div style={{ width: "100%", height: 220 }}><ResponsiveContainer><BarChart data={subjectData}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} /><XAxis dataKey="subject" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => [`${value}%`, "Average"]} /><Bar dataKey="average" fill={COLORS.teal} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
    <Card className="p-4"><div className="font-bold text-stone-700 text-sm mb-1">Student-wise performance</div><div className="text-xs text-stone-400 mb-3">Average score across completed diagnostics.</div><div style={{ width: "100%", height: 220 }}><ResponsiveContainer><BarChart data={studentData}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} /><XAxis dataKey="student" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => [`${value}%`, "Average"]} /><Bar dataKey="average" fill={COLORS.indigo} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
  </div>);
}
function QuickAction({ icon: Icon, label, onClick }) { return <button onClick={onClick} className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-3 hover:border-indigo-300 hover:shadow-sm transition text-left"><div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center"><Icon size={16} className="text-indigo-700" /></div><div className="text-sm font-semibold text-stone-700">{label}</div><ChevronRight size={15} className="ml-auto text-stone-300" /></button>; }

/* ---------- Classes & Students ---------- */

function ClassesStudents({ db, setDb, scope }) {
  const [newClass, setNewClass] = useState({ name: "", section: "", year: new Date().getFullYear().toString() });
  const [selectedClassId, setSelectedClassId] = useState(scope.classes[0]?.id || null);
  const [studentForm, setStudentForm] = useState({ name: "", rollNo: "" });
  const [editingId, setEditingId] = useState(null); const [search, setSearch] = useState(""); const [credModal, setCredModal] = useState(null);

  const addClass = () => { if (!newClass.name.trim()) return; const c = { id: uid(), name: newClass.name.trim(), section: newClass.section.trim(), year: newClass.year, teacherId: scope.teacherId }; setDb({ ...db, classes: [...db.classes, c] }); setSelectedClassId(c.id); setNewClass({ name: "", section: "", year: newClass.year }); };
  const deleteClass = (id) => { setDb({ ...db, classes: db.classes.filter((c) => c.id !== id), students: db.students.filter((s) => s.classId !== id) }); if (selectedClassId === id) setSelectedClassId(null); };
  const addOrEditStudent = () => {
    if (!studentForm.name.trim() || !selectedClassId) return;
    if (editingId) { setDb({ ...db, students: db.students.map((s) => s.id === editingId ? { ...s, name: studentForm.name, rollNo: studentForm.rollNo } : s) }); setEditingId(null); }
    else { setDb({ ...db, students: [...db.students, { id: uid(), name: studentForm.name.trim(), rollNo: studentForm.rollNo.trim() || "-", classId: selectedClassId, username: null, salt: null, passwordHash: null, disabled: false }] }); }
    setStudentForm({ name: "", rollNo: "" });
  };
  const deleteStudent = (id) => setDb({ ...db, students: db.students.filter((s) => s.id !== id) });
  const toggleDisabled = (id) => setDb({ ...db, students: db.students.map((s) => s.id === id ? { ...s, disabled: !s.disabled } : s) });
  const classStudents = scope.students.filter((s) => s.classId === selectedClassId && (s.name.toLowerCase().includes(search.toLowerCase()) || s.rollNo.toLowerCase().includes(search.toLowerCase())));
  const credStudent = db.students.find((s) => s.id === credModal);

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-2xl font-black text-stone-800">Classes &amp; Students</h1>
      <Card className="p-5"><div className="font-bold text-stone-700 mb-3 text-sm">Create a class</div><div className="grid sm:grid-cols-4 gap-3"><TextInput placeholder="Class (e.g. 10)" value={newClass.name} onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} /><TextInput placeholder="Section (e.g. A)" value={newClass.section} onChange={(e) => setNewClass({ ...newClass, section: e.target.value })} /><TextInput placeholder="Academic year" value={newClass.year} onChange={(e) => setNewClass({ ...newClass, year: e.target.value })} /><PrimaryButton icon={Plus} onClick={addClass}>Create Class</PrimaryButton></div></Card>
      <div className="flex gap-2 flex-wrap">{scope.classes.map((c) => (<button key={c.id} onClick={() => setSelectedClassId(c.id)} className={`px-3 py-1.5 rounded-full text-sm border flex items-center gap-2 ${selectedClassId === c.id ? "bg-indigo-700 text-white border-indigo-700" : "bg-white border-stone-200 text-stone-600 hover:border-indigo-300"}`}>Class {c.name}{c.section && "-" + c.section}<Trash2 size={12} className="opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteClass(c.id); }} /></button>))}{scope.classes.length === 0 && <div className="text-sm text-stone-400">No classes yet — create one above.</div>}</div>
      {selectedClassId && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3"><div className="font-bold text-stone-700 text-sm">Students in this class</div><div className="relative w-56"><Search size={14} className="absolute left-2.5 top-2.5 text-stone-400" /><TextInput placeholder="Search students…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
          <div className="grid sm:grid-cols-3 gap-3 mb-4"><TextInput placeholder="Student name" value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} /><TextInput placeholder="Roll number / ID" value={studentForm.rollNo} onChange={(e) => setStudentForm({ ...studentForm, rollNo: e.target.value })} /><PrimaryButton icon={editingId ? Pencil : Plus} onClick={addOrEditStudent}>{editingId ? "Save changes" : "Add Student"}</PrimaryButton></div>
          {classStudents.length === 0 ? <EmptyHint text="No students in this class yet." /> : (<div className="divide-y divide-stone-100">{classStudents.map((s) => (<div key={s.id} className="py-2.5 flex items-center justify-between text-sm"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{s.name.slice(0, 1).toUpperCase()}</div><div><div className="font-semibold text-stone-700">{s.name}</div><div className="text-xs text-stone-400 flex items-center gap-2">Roll {s.rollNo}{s.username ? <Badge tone={s.disabled ? "rose" : "teal"}>{s.disabled ? "Disabled" : "Login: " + s.username}</Badge> : <Badge tone="amber">No login</Badge>}</div></div></div><div className="flex gap-1"><GhostButton icon={KeyRound} onClick={() => setCredModal(s.id)}>{s.username ? "Reset Login" : "Set Login"}</GhostButton>{s.username && <GhostButton icon={s.disabled ? CheckCircle : Ban} onClick={() => toggleDisabled(s.id)}>{s.disabled ? "Enable" : "Disable"}</GhostButton>}<GhostButton icon={Pencil} onClick={() => { setStudentForm({ name: s.name, rollNo: s.rollNo }); setEditingId(s.id); }}>Edit</GhostButton><GhostButton icon={Trash2} danger onClick={() => deleteStudent(s.id)}>Delete</GhostButton></div></div>))}</div>)}
        </Card>
      )}
      {credStudent && <SetStudentCredentialsModal db={db} setDb={setDb} student={credStudent} onClose={() => setCredModal(null)} />}
    </div>
  );
}
function SetStudentCredentialsModal({ db, setDb, student, onClose }) {
  const [username, setUsername] = useState(student.username || (student.name.split(" ")[0] + student.rollNo).toLowerCase().replace(/\s/g, ""));
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const save = async () => {
    setError("");
    if (!username.trim() || password.length < 4) { setError("Enter a username and a password of at least 4 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (db.students.some((s) => s.id !== student.id && s.username && s.username.toLowerCase() === username.trim().toLowerCase())) { setError("That username is already taken by another student."); return; }
    setBusy(true); const salt = makeSalt(); const passwordHash = await hashPassword(password, salt);
    await setDb({ ...db, students: db.students.map((s) => s.id === student.id ? { ...s, username: username.trim(), salt, passwordHash, disabled: false } : s) });
    setBusy(false); setDone(true);
  };
  return (<Modal title={(student.username ? "Reset" : "Set") + " Login — " + student.name} onClose={onClose}>{done ? <div className="text-sm text-teal-700 flex items-center gap-2"><CheckCircle2 size={16} />Saved. Share it with the student — it won't be shown here again.</div> : (<div className="space-y-2"><div className="text-xs text-stone-500 mb-1">Username</div><TextInput value={username} onChange={(e) => setUsername(e.target.value)} /><div className="text-xs text-stone-500 mb-1 mt-2">New password</div><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" /><PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" />{error && <div className="text-xs text-rose-600">{error}</div>}<PrimaryButton className="w-full justify-center" icon={busy ? Loader2 : KeyRound} disabled={busy} onClick={save}>Save Login</PrimaryButton></div>)}</Modal>);
}

/* ---------- Subjects ---------- */

function Subjects({ db, setDb }) {
  const [name, setName] = useState("");
  const add = () => { if (!name.trim()) return; setDb({ ...db, subjects: [...db.subjects, { id: uid(), name: name.trim() }] }); setName(""); };
  const del = (id) => setDb({ ...db, subjects: db.subjects.filter((s) => s.id !== id) });
  return (<div className="max-w-3xl space-y-5"><h1 className="text-2xl font-black text-stone-800">Subjects</h1><Card className="p-5"><div className="flex gap-3"><TextInput placeholder="e.g. Mathematics, Science, Accountancy…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /><PrimaryButton icon={Plus} onClick={add}>Add Subject</PrimaryButton></div></Card><div className="grid sm:grid-cols-3 gap-3">{db.subjects.map((s) => <Card key={s.id} className="p-4 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold text-stone-700 text-sm"><BookOpen size={15} className="text-indigo-600" />{s.name}</div><Trash2 size={14} className="text-stone-300 hover:text-rose-500 cursor-pointer" onClick={() => del(s.id)} /></Card>)}{db.subjects.length === 0 && <div className="text-sm text-stone-400">No subjects yet.</div>}</div></div>);
}

/* ---------- AI Quiz Creator ---------- */

function QuizCreator({ db, setDb, scope, onCreated }) {
  const [form, setForm] = useState({ classId: scope.classes[0]?.id || "", subjectId: db.subjects[0]?.id || "", chapter: "", topicsText: "", difficulty: "Mixed", numQuestions: 10, durationMinutes: 15, instructions: "" });
  const [types, setTypes] = useState(["mcq"]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const toggleType = (id) => setTypes((t) => t.includes(id) ? t.filter((x) => x !== id) : [...t, id]);

  const generate = async () => {
    setError("");
    const topics = form.topicsText.split("\n").map((t) => t.trim()).filter(Boolean);
    if (!form.classId || !form.subjectId || !form.chapter.trim() || topics.length === 0 || types.length === 0) { setError("Fill in class, subject, chapter, at least one topic, and at least one question type."); return; }
    if (form.numQuestions > 12) { setError("Keep the total to 12 questions or fewer for reliable generation."); return; }
    setLoading(true);
    try {
      const subject = db.subjects.find((s) => s.id === form.subjectId);
      const questions = await generateDiagnosticQuiz({ subject: subject.name, chapter: form.chapter, topics, typeIds: types, numQuestions: Number(form.numQuestions), difficulty: form.difficulty, instructions: form.instructions });
      const assessment = { id: uid(), classId: form.classId, subjectId: form.subjectId, subjectName: subject.name, chapter: form.chapter, topics, questionTypes: types, difficulty: form.difficulty, durationMinutes: Number(form.durationMinutes), instructions: form.instructions, questions, status: "draft", quizCode: null, createdAt: new Date().toISOString() };
      await setDb({ ...db, assessments: [...db.assessments, assessment] });
      onCreated(assessment.id);
    } catch (e) { setError("AI generation failed. Try reducing the question count or simplifying the topics, then try again."); }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div><h1 className="text-2xl font-black text-stone-800 flex items-center gap-2"><Wand2 size={22} className="text-indigo-600" /> Create AI Quiz</h1><p className="text-stone-500 text-sm">Tell the AI what to cover — it drafts the diagnostic quiz, you review and approve before anyone sees it.</p></div>
      <Card className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className="text-xs font-semibold text-stone-500 mb-1">Class</div><Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}><option value="">Select class</option>{scope.classes.map((c) => <option key={c.id} value={c.id}>Class {c.name}{c.section && "-" + c.section}</option>)}</Select></div>
          <div><div className="text-xs font-semibold text-stone-500 mb-1">Subject</div><Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}><option value="">Select subject</option>{db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        </div>
        <div><div className="text-xs font-semibold text-stone-500 mb-1">Chapter</div><TextInput placeholder="e.g. Triangles" value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })} /></div>
        <div><div className="text-xs font-semibold text-stone-500 mb-1">Topics (one per line)</div><textarea rows={3} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder={"Similarity of Triangles\nPythagoras Theorem\nArea of Similar Triangles"} value={form.topicsText} onChange={(e) => setForm({ ...form, topicsText: e.target.value })} /></div>
        <div><div className="text-xs font-semibold text-stone-500 mb-1.5">Question type(s)</div><div className="flex flex-wrap gap-2">{QUESTION_TYPES.map((qt) => <button key={qt.id} onClick={() => toggleType(qt.id)} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${types.includes(qt.id) ? "bg-indigo-700 text-white border-indigo-700" : "bg-white border-stone-200 text-stone-600"}`}>{qt.label}</button>)}</div></div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><div className="text-xs font-semibold text-stone-500 mb-1">Number of questions</div><TextInput type="number" min={1} max={12} value={form.numQuestions} onChange={(e) => setForm({ ...form, numQuestions: e.target.value })} /></div>
          <div><div className="text-xs font-semibold text-stone-500 mb-1">Difficulty</div><Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>Easy</option><option>Medium</option><option>Hard</option><option>Mixed</option></Select></div>
          <div><div className="text-xs font-semibold text-stone-500 mb-1">Duration (minutes)</div><TextInput type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div>
        </div>
        <div><div className="text-xs font-semibold text-stone-500 mb-1">Additional instructions <span className="font-normal text-stone-400">(optional)</span></div><TextInput placeholder="e.g. Focus more on application-based questions." value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
        {error && <div className="text-sm text-rose-600 flex items-center gap-1"><AlertTriangle size={14} />{error}</div>}
        <PrimaryButton icon={loading ? Loader2 : Sparkles} onClick={generate} disabled={loading} className="w-full justify-center">{loading ? "Generating quiz…" : "✨ Generate Quiz"}</PrimaryButton>
      </Card>
    </div>
  );
}

/* ---------- Review & Edit (also used to reopen drafts) ---------- */

function ReviewEditQuiz({ db, setDb, scope, assessmentId, onDone }) {
  const assessment = db.assessments.find((a) => a.id === assessmentId);
  const [questions, setQuestions] = useState(assessment?.questions || []);
  const [regenIdx, setRegenIdx] = useState(null);
  const [regenAllBusy, setRegenAllBusy] = useState(false);
  const [addForm, setAddForm] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { setQuestions(assessment?.questions || []); }, [assessmentId]);
  if (!assessment) return <EmptyHint text="Assessment not found." />;
  const cls = scope.classes.find((c) => c.id === assessment.classId);

  const updateQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const deleteQ = (i) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  const saveDraft = async () => { await setDb({ ...db, assessments: db.assessments.map((a) => a.id === assessmentId ? { ...a, questions } : a) }); };

  const regenerate = async (i) => {
    setRegenIdx(i); setError("");
    try { const q = questions[i]; const nq = await regenerateOneQuestion({ subject: assessment.subjectName, chapter: assessment.chapter, topic: q.topic, typeId: q.type === "mcq" ? "mcq" : q.type === "tf" ? "tf" : q.type === "fill" ? "fill" : "q" + q.marks, difficulty: q.difficulty || "medium" }); updateQ(i, nq); }
    catch (e) { setError("Could not regenerate that question — try again."); }
    setRegenIdx(null);
  };
  const regenerateAll = async () => {
    setRegenAllBusy(true); setError("");
    try { const qs = await generateDiagnosticQuiz({ subject: assessment.subjectName, chapter: assessment.chapter, topics: assessment.topics, typeIds: assessment.questionTypes, numQuestions: assessment.questions.length, difficulty: assessment.difficulty, instructions: assessment.instructions }); setQuestions(qs); }
    catch (e) { setError("Could not regenerate the quiz — try again."); }
    setRegenAllBusy(false);
  };
  const addQuestion = async (typeId, topic, difficulty) => {
    setError("");
    try { const q = await regenerateOneQuestion({ subject: assessment.subjectName, chapter: assessment.chapter, topic, typeId, difficulty }); setQuestions((qs) => [...qs, q]); setAddForm(null); }
    catch (e) { setError("Could not generate that question — try again."); }
  };

  const approve = async () => {
    const existingCodes = new Set(db.assessments.filter((a) => a.quizCode).map((a) => a.quizCode));
    const quizCode = makeQuizCode(assessment.subjectName, existingCodes);
    await setDb({ ...db, assessments: db.assessments.map((a) => a.id === assessmentId ? { ...a, questions, status: "live", quizCode, startedAt: new Date().toISOString() } : a) });
    onDone();
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-black text-stone-800">{assessment.subjectName} — {assessment.chapter}</h1><p className="text-stone-500 text-sm">Class {cls?.name}{cls?.section} · {questions.length} questions · {assessment.durationMinutes} min</p></div>
        <Badge tone="amber">AI Generated — Teacher Review Required</Badge>
      </div>
      {assessment.status !== "draft" && <Card className="p-3 bg-amber-50 border-amber-200 text-xs text-amber-800 flex items-center gap-2"><AlertTriangle size={14} /> This assessment has already been used ({assessment.status}). Saving changes only affects future attempts.</Card>}
      {error && <div className="text-sm text-rose-600 flex items-center gap-1"><AlertTriangle size={14} />{error}</div>}
      <div className="space-y-3">
        {questions.map((q, i) => (
          <Card key={q.id || i} className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500"><div className="flex items-center gap-2"><Badge tone="indigo">Q{i + 1}</Badge><Badge>{q.type}</Badge><span>{q.topic}</span><span>· {q.difficulty}</span></div>
              <div className="flex items-center gap-1"><GhostButton icon={regenIdx === i ? Loader2 : RefreshCw} onClick={() => regenerate(i)}>{regenIdx === i ? "Regenerating…" : "Regenerate"}</GhostButton><GhostButton icon={Trash2} danger onClick={() => deleteQ(i)}>Delete</GhostButton></div>
            </div>
            <textarea rows={2} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" value={q.question} onChange={(e) => updateQ(i, { question: e.target.value })} />
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">Marks: <TextInput type="number" className="!w-16 !py-1" value={q.marks} onChange={(e) => updateQ(i, { marks: Number(e.target.value) })} /></div>
              <div className="flex items-center gap-1">Topic: <TextInput className="!py-1 !w-40" value={q.topic} onChange={(e) => updateQ(i, { topic: e.target.value })} /></div>
            </div>
            {q.type === "mcq" && <div className="grid grid-cols-2 gap-2">{q.options.map((opt, oi) => (<div key={oi} className="flex items-center gap-1.5"><input type="radio" checked={q.correctIndex === oi} onChange={() => updateQ(i, { correctIndex: oi })} /><TextInput className="!py-1" value={opt} onChange={(e) => { const options = [...q.options]; options[oi] = e.target.value; updateQ(i, { options }); }} /></div>))}</div>}
            {q.type === "tf" && <div className="flex gap-2">{[true, false].map((v) => <button key={String(v)} onClick={() => updateQ(i, { correctAnswer: v })} className={`px-3 py-1 rounded-lg border text-xs font-medium ${q.correctAnswer === v ? "bg-indigo-700 text-white border-indigo-700" : "border-stone-200"}`}>{v ? "True" : "False"}</button>)}</div>}
            {q.type === "fill" && <div className="text-xs flex items-center gap-1.5">Correct answer: <TextInput className="!py-1 !w-48" value={q.correctAnswer} onChange={(e) => updateQ(i, { correctAnswer: e.target.value })} /></div>}
            {q.type === "subjective" && <div className="text-xs space-y-1"><div>Model answer: <TextInput className="!py-1" value={q.modelAnswer} onChange={(e) => updateQ(i, { modelAnswer: e.target.value })} /></div><div className="text-stone-400">Marking points: {q.markingPoints?.join(" · ")}</div></div>}
          </Card>
        ))}
      </div>

      {addForm ? (
        <Card className="p-4"><AddQuestionForm topics={assessment.topics} types={assessment.questionTypes} onCancel={() => setAddForm(null)} onSubmit={(t, topic, d) => addQuestion(t, topic, d)} /></Card>
      ) : <GhostButton icon={Plus} onClick={() => setAddForm(true)}>Add another question</GhostButton>}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <GhostButton icon={regenAllBusy ? Loader2 : Copy} onClick={regenerateAll}>{regenAllBusy ? "Regenerating…" : "Regenerate entire quiz"}</GhostButton>
        <GhostButton icon={CheckCircle2} onClick={saveDraft}>Save Draft</GhostButton>
        <PrimaryButton icon={PlayCircle} onClick={approve} className="ml-auto">✅ Approve &amp; Start Quiz</PrimaryButton>
      </div>
    </div>
  );
}
function AddQuestionForm({ topics, types, onCancel, onSubmit }) {
  const [type, setType] = useState(types[0] || "mcq"); const [topic, setTopic] = useState(topics[0] || ""); const [difficulty, setDifficulty] = useState("medium"); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onSubmit(type, topic, difficulty); setBusy(false); };
  return (<div className="grid sm:grid-cols-4 gap-2 items-end"><div><div className="text-xs text-stone-500 mb-1">Type</div><Select value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}</Select></div><div><div className="text-xs text-stone-500 mb-1">Topic</div><Select value={topic} onChange={(e) => setTopic(e.target.value)}>{topics.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div><div><div className="text-xs text-stone-500 mb-1">Difficulty</div><Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select></div><div className="flex gap-2"><PrimaryButton icon={busy ? Loader2 : Sparkles} onClick={go} disabled={busy}>Generate</PrimaryButton><GhostButton onClick={onCancel}>Cancel</GhostButton></div></div>);
}

/* ---------- Live Quizzes ---------- */

function LiveQuizzesList({ db, setDb, scope, refresh, onOpen }) {
  useEffect(() => { const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);
  const live = scope.assessments.filter((a) => a.status === "live");
  return (
    <div className="max-w-4xl space-y-5">
      <div><h1 className="text-2xl font-black text-stone-800 flex items-center gap-2"><Radio size={20} className="text-rose-500" /> Live Quizzes</h1><p className="text-stone-500 text-sm">Updates automatically as students join and submit.</p></div>
      {live.length === 0 ? <Card className="p-10"><EmptyHint text="No quiz is live right now. Approve a quiz from Create AI Quiz or Previous Assessments to start one." /></Card> : (
        <div className="grid sm:grid-cols-2 gap-4">{live.map((a) => { const cls = scope.classes.find((c) => c.id === a.classId); const attempts = scope.quizAttempts.filter((x) => x.assessmentId === a.id); const total = scope.students.filter((s) => s.classId === a.classId).length; return (<Card key={a.id} className="p-4 cursor-pointer hover:shadow-md transition" onClick={() => onOpen(a.id)}><div className="flex items-start justify-between"><div><div className="font-bold text-stone-800">{a.subjectName} — {a.chapter}</div><div className="text-xs text-stone-400">Class {cls?.name}{cls?.section}</div></div><Badge tone="rose">LIVE</Badge></div><div className="mt-2 text-lg font-black text-indigo-700 tracking-widest">{a.quizCode}</div><div className="text-xs text-stone-500 mt-1">{attempts.length} / {total} students joined · {attempts.filter((x) => x.status === "submitted").length} completed</div></Card>); })}</div>
      )}
    </div>
  );
}
function LiveMonitor({ db, setDb, scope, refresh, assessment, onEdit, onClosed }) {
  useEffect(() => { const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);
  const students = scope.students.filter((s) => s.classId === assessment.classId);
  const attempts = scope.quizAttempts.filter((a) => a.assessmentId === assessment.id);
  const statusFor = (studentId) => attempts.find((a) => a.studentId === studentId)?.status || "not_started";
  const counts = { joined: attempts.length, inProgress: attempts.filter((a) => a.status === "in_progress" || a.status === "joined").length, submitted: attempts.filter((a) => a.status === "submitted").length, notStarted: students.length - attempts.length };
  const closeQuiz = async () => { await setDb({ ...db, assessments: db.assessments.map((a) => a.id === assessment.id ? { ...a, status: "closed", closedAt: new Date().toISOString() } : a) }); onClosed(); };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-black text-stone-800">{assessment.subjectName} — {assessment.chapter}</h1><div className="text-lg font-black text-indigo-700 tracking-widest">{assessment.quizCode}</div></div><Badge tone="rose">LIVE — Waiting / In Progress</Badge></div>
      <div className="grid grid-cols-3 gap-3"><Card className="p-4 text-center"><div className="text-2xl font-black text-stone-800">{counts.joined}</div><div className="text-xs text-stone-500">Joined</div></Card><Card className="p-4 text-center"><div className="text-2xl font-black text-amber-600">{counts.inProgress}</div><div className="text-xs text-stone-500">Attending</div></Card><Card className="p-4 text-center"><div className="text-2xl font-black text-teal-600">{counts.submitted}</div><div className="text-xs text-stone-500">Completed</div></Card></div>
      <Card className="p-4"><div className="text-xs text-stone-400 mb-2">Scores and answers stay hidden while the quiz is live.</div><div className="divide-y divide-stone-100">{students.map((s) => { const st = statusFor(s.id); const label = st === "submitted" ? "Submitted" : st === "in_progress" ? "Attending" : st === "joined" ? "Joined" : "Not joined"; const tone = st === "submitted" ? "teal" : st === "in_progress" ? "amber" : st === "joined" ? "indigo" : "neutral"; return (<div key={s.id} className="py-2 flex items-center justify-between text-sm"><div className="text-stone-700">{s.name}</div><Badge tone={tone}>{label}</Badge></div>); })}</div></Card>
      <div className="flex gap-3"><GhostButton icon={Pencil} onClick={onEdit}>Edit Quiz</GhostButton><PrimaryButton icon={StopCircle} onClick={closeQuiz} className="bg-rose-600 hover:bg-rose-700">Close Quiz</PrimaryButton></div>
    </div>
  );
}

/* ---------- Previous Assessments (list + router) ---------- */

function PreviousAssessments({ db, setDb, scope, refresh, openAssessmentId, onConsumeOpen }) {
  const [activeId, setActiveId] = useState(null);
  const [mode, setMode] = useState(null); // 'review' | 'live' | 'results'
  useEffect(() => { if (openAssessmentId) { open(openAssessmentId); onConsumeOpen(); } }, [openAssessmentId]);

  const open = (id) => { const a = db.assessments.find((x) => x.id === id); if (!a) return; setActiveId(id); setMode(a.status === "draft" ? "review" : a.status === "live" ? "live" : "results"); };

  if (activeId) {
    const assessment = db.assessments.find((a) => a.id === activeId);
    if (!assessment) { setActiveId(null); return null; }
    return (
      <div className="space-y-3">
        <button onClick={() => { setActiveId(null); setMode(null); }} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800"><ChevronLeft size={15} /> Back to previous assessments</button>
        {mode === "review" && <ReviewEditQuiz db={db} setDb={setDb} scope={scope} assessmentId={activeId} onDone={() => open(activeId)} />}
        {mode === "live" && <LiveMonitor db={db} setDb={setDb} scope={scope} refresh={refresh} assessment={assessment} onEdit={() => setMode("review")} onClosed={() => setMode("results")} />}
        {mode === "results" && <AssessmentResults db={db} setDb={setDb} scope={scope} assessment={assessment} onEdit={() => setMode("review")} onRelaunch={() => open(activeId)} />}
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-2xl font-black text-stone-800">Previous Assessments</h1>
      {scope.assessments.length === 0 ? <Card className="p-10"><EmptyHint text="No assessments yet." /></Card> : (
        <div className="grid sm:grid-cols-2 gap-4">{[...scope.assessments].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).map((a) => { const cls = scope.classes.find((c) => c.id === a.classId); const n = db.quizAttempts.filter((x) => x.assessmentId === a.id && x.status === "submitted").length; return (<Card key={a.id} className="p-4 cursor-pointer hover:shadow-md transition" onClick={() => open(a.id)}><div className="flex items-start justify-between"><div><div className="font-bold text-stone-800">{a.subjectName} — {a.chapter}</div><div className="text-xs text-stone-400">Class {cls?.name}{cls?.section} · {new Date(a.createdAt).toLocaleDateString()}</div></div><Badge tone={a.status === "live" ? "rose" : a.status === "closed" ? "teal" : "amber"}>{a.status === "live" ? "Live" : a.status === "closed" ? "Closed" : "Draft"}</Badge></div><div className="mt-2 text-xs text-stone-500">{a.topics.join(", ")}</div><div className="mt-1 text-xs text-stone-400">{n} student{n === 1 ? "" : "s"} completed{a.quizCode ? ` · Code ${a.quizCode}` : ""}</div></Card>); })}</div>
      )}
    </div>
  );
}

function ClassTopicTable({ db, attempts }) {
  const topicMap = {};
  attempts.forEach((a) => (a.topics || []).forEach((t) => { if (!topicMap[t.topic]) topicMap[t.topic] = []; topicMap[t.topic].push(t.percent); }));
  const stats = Object.entries(topicMap).map(([topic, percents]) => { const avg = percents.reduce((x, y) => x + y, 0) / percents.length; const needing = percents.filter((p) => p < db.thresholds.needsPractice).length; return { topic, avg, needing, total: percents.length, pct: Math.round((needing / percents.length) * 100) }; }).sort((a, b) => b.needing - a.needing);
  if (stats.length === 0) return <EmptyHint text="No completed attempts yet for this assessment." />;
  return (
    <div className="space-y-3">
      <Card className="p-3 bg-indigo-50 border-indigo-200 text-sm text-indigo-800 flex items-start gap-2"><Info size={15} className="mt-0.5 shrink-0" /><span>AI-generated learning insight: {classroomInsight(stats)}</span></Card>
      <Card className="p-4 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-stone-500 border-b border-stone-200"><th className="py-2 pr-3">Topic</th><th className="py-2 pr-3">Students Struggling</th><th className="py-2 pr-3">Class Status</th></tr></thead><tbody>{stats.map((t) => { const isGap = t.pct >= 50; return (<tr key={t.topic} className="border-b border-stone-100"><td className="py-2 pr-3 font-medium text-stone-700">{t.topic}</td><td className="py-2 pr-3">{t.needing} / {t.total}</td><td className="py-2 pr-3">{isGap ? <Badge tone="rose">🔴 Priority</Badge> : t.avg >= db.thresholds.strong ? <Badge tone="teal">🟢 Strong</Badge> : <Badge tone="amber">🟡 Needs Practice</Badge>}</td></tr>); })}</tbody></table></Card>
      <div style={{ width: "100%", height: 220 }}><ResponsiveContainer><BarChart data={stats.map((t) => ({ name: t.topic, avg: Math.round(t.avg) }))}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="avg" radius={[6, 6, 0, 0]} fill={COLORS.indigo} /></BarChart></ResponsiveContainer></div>
    </div>
  );
}

function AssessmentResults({ db, setDb, scope, assessment, onEdit, onRelaunch }) {
  const attempts = scope.quizAttempts.filter((a) => a.assessmentId === assessment.id && a.status === "submitted");
  const [openStudentId, setOpenStudentId] = useState(null);
  const relaunch = async () => { const existingCodes = new Set(db.assessments.filter((a) => a.quizCode).map((a) => a.quizCode)); const quizCode = makeQuizCode(assessment.subjectName, existingCodes); await setDb({ ...db, assessments: db.assessments.map((a) => a.id === assessment.id ? { ...a, status: "live", quizCode, startedAt: new Date().toISOString() } : a) }); onRelaunch(); };

  if (openStudentId) {
    const attempt = attempts.find((a) => a.studentId === openStudentId);
    const student = scope.students.find((s) => s.id === openStudentId);
    return (<div className="max-w-2xl space-y-3"><button onClick={() => setOpenStudentId(null)} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800"><ChevronLeft size={15} /> Back to results</button><DiagnosticResultView assessment={assessment} attempt={attempt} thresholds={db.thresholds} studentName={student?.name} /></div>);
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-black text-stone-800">{assessment.subjectName} — {assessment.chapter}</h1><p className="text-stone-500 text-sm">{attempts.length} student{attempts.length === 1 ? "" : "s"} completed · Diagnostic Assessment — Not an Official School Result</p></div><div className="flex gap-2"><GhostButton icon={Pencil} onClick={onEdit}>Edit / Reuse</GhostButton><PrimaryButton icon={RefreshCw} onClick={relaunch}>Reassess (Relaunch)</PrimaryButton></div></div>
      <ClassTopicTable db={db} attempts={attempts} />
      <Card className="p-5"><div className="font-bold text-stone-700 text-sm mb-3">Individual results</div><div className="divide-y divide-stone-100">{attempts.map((a) => { const student = scope.students.find((s) => s.id === a.studentId); return (<button key={a.id} onClick={() => setOpenStudentId(a.studentId)} className="w-full py-2.5 flex items-center justify-between text-sm hover:bg-stone-50 -mx-1 px-1 rounded"><div className="text-stone-700 font-medium">{student?.name}</div><div className="font-bold text-stone-700">{Math.round((a.score / a.maxScore) * 100)}%</div></button>); })}</div></Card>
    </div>
  );
}

/* ---------- Classroom Learning Analysis ---------- */

function ClassroomLearningAnalysis({ db, scope }) {
  const [classId, setClassId] = useState(scope.classes[0]?.id || "");
  const classAssessments = scope.assessments.filter((a) => a.classId === classId && (a.status === "closed" || a.status === "live"));
  const [assessmentId, setAssessmentId] = useState("");
  useEffect(() => { setAssessmentId(classAssessments[0]?.id || ""); }, [classId]);
  const assessment = scope.assessments.find((a) => a.id === assessmentId);
  const attempts = scope.quizAttempts.filter((a) => a.assessmentId === assessmentId && a.status === "submitted");

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-black text-stone-800">Classroom Learning Analysis</h1><p className="text-stone-500 text-sm">AI identifies patterns from completed diagnostic quizzes; you decide the classroom response.</p></div>
        <div className="flex gap-2"><Select value={classId} onChange={(e) => setClassId(e.target.value)} className="max-w-[180px]">{scope.classes.map((c) => <option key={c.id} value={c.id}>Class {c.name}{c.section && "-" + c.section}</option>)}</Select><Select value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} className="max-w-[220px]">{classAssessments.map((a) => <option key={a.id} value={a.id}>{a.subjectName} — {a.chapter}</option>)}</Select></div>
      </div>
      {!assessment ? <Card className="p-10"><EmptyHint text="No completed diagnostic quiz for this class yet." /></Card> : <ClassTopicTable db={db} attempts={attempts} />}
    </div>
  );
}

/* ---------- Student Profiles (teacher-side) & shared diagnostic profile view ---------- */

function StudentProfilesTeacher({ db, scope }) {
  const [search, setSearch] = useState(""); const [selectedId, setSelectedId] = useState(null);
  const filtered = scope.students.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const selected = scope.students.find((s) => s.id === selectedId);
  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-2xl font-black text-stone-800">Student Profiles</h1>
      <div className="relative max-w-sm"><Search size={14} className="absolute left-2.5 top-2.5 text-stone-400" /><TextInput placeholder="Search students…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {!selected ? (<div className="grid sm:grid-cols-3 gap-3">{filtered.map((s) => { const cls = scope.classes.find((c) => c.id === s.classId); return <Card key={s.id} className="p-4 cursor-pointer hover:shadow-md transition flex items-center gap-3" onClick={() => setSelectedId(s.id)}><div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{s.name.slice(0, 1)}</div><div><div className="font-semibold text-stone-700 text-sm">{s.name}</div><div className="text-xs text-stone-400">Class {cls?.name}{cls?.section} · Roll {s.rollNo}</div></div></Card>; })}{filtered.length === 0 && <div className="text-sm text-stone-400">No students found.</div>}</div>) : (<div><button onClick={() => setSelectedId(null)} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800 mb-3"><ChevronLeft size={15} /> Back to all students</button><StudentDiagnosticProfile db={db} student={selected} /></div>)}
    </div>
  );
}

function StudentDiagnosticProfile({ db, student }) {
  const attempts = db.quizAttempts.filter((a) => a.studentId === student.id && a.status === "submitted");
  const bySubject = {};
  attempts.forEach((a) => { const assessment = db.assessments.find((x) => x.id === a.assessmentId); if (!assessment) return; const subj = assessment.subjectName; if (!bySubject[subj]) bySubject[subj] = []; bySubject[subj].push({ ...a, assessment }); });
  const overallBySubject = Object.entries(bySubject).map(([subj, list]) => ({ subject: subj, avg: list.reduce((s, x) => s + (x.score / x.maxScore) * 100, 0) / list.length }));
  const topicAgg = {}; attempts.forEach((a) => (a.topics || []).forEach((t) => { if (!topicAgg[t.topic]) topicAgg[t.topic] = []; topicAgg[t.topic].push(t.percent); }));
  const topicList = Object.entries(topicAgg).map(([topic, arr]) => ({ topic, percent: arr[arr.length - 1] }));

  return (
    <div className="space-y-5">
      <Card className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">{student.name.slice(0, 1)}</div><div><div className="font-black text-stone-800">{student.name}</div><div className="text-xs text-stone-400">Roll {student.rollNo}</div></div></div></Card>
      {attempts.length === 0 ? <Card className="p-10"><EmptyHint text="No completed diagnostic quizzes yet." /></Card> : (<>
        <Card className="p-5"><div className="font-bold text-stone-700 text-sm mb-3">Overall Performance</div><div className="grid sm:grid-cols-3 gap-4">{overallBySubject.map((o) => <div key={o.subject} className="flex items-center gap-3"><Ring percent={o.avg} color={classify(o.avg, db.thresholds).color} /><div><div className="font-semibold text-stone-700 text-sm">{o.subject}</div><div className="text-xs" style={{ color: classify(o.avg, db.thresholds).color }}>{classify(o.avg, db.thresholds).label}</div></div></div>)}</div></Card>
        <Card className="p-5"><div className="font-bold text-stone-700 text-sm mb-3">Learning Profile by Topic</div><div className="grid sm:grid-cols-2 gap-3">{topicList.map((t) => { const c = classify(t.percent, db.thresholds); return <div key={t.topic} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: c.bg }}><div className="flex items-center gap-2 text-sm font-medium" style={{ color: c.color }}>{c.dot} {t.topic}</div><div className="text-sm font-bold" style={{ color: c.color }}>{t.percent}%</div></div>; })}</div></Card>
        {Object.entries(bySubject).map(([subj, list]) => { const sorted = [...list].sort((a, b) => (a.assessment.createdAt || "").localeCompare(b.assessment.createdAt || "")); const scores = sorted.map((x) => Math.round((x.score / x.maxScore) * 100)); const t = trendOf(scores); return (<Card key={subj} className="p-5"><div className="flex items-center justify-between mb-3"><div className="font-bold text-stone-700 text-sm">{subj} — Improvement Trend</div><div className="text-xs font-semibold flex items-center gap-1" style={{ color: t.color }}><t.icon size={13} />{t.label}</div></div><div style={{ width: "100%", height: 180 }}><ResponsiveContainer><LineChart data={sorted.map((x) => ({ name: x.assessment.chapter, score: Math.round((x.score / x.maxScore) * 100) }))}><CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="score" stroke={COLORS.indigo} strokeWidth={2.5} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></div></Card>); })}
      </>)}
    </div>
  );
}

/* ---------- Settings ---------- */

function SettingsPanel({ db, setDb }) {
  const [strong, setStrong] = useState(db.thresholds.strong); const [np, setNp] = useState(db.thresholds.needsPractice);
  const save = () => setDb({ ...db, thresholds: { strong: Number(strong), needsPractice: Number(np) } });
  return (<div className="max-w-md space-y-5"><h1 className="text-2xl font-black text-stone-800">Settings</h1><Card className="p-5 space-y-4"><div className="text-sm font-semibold text-stone-700">Performance thresholds</div><p className="text-xs text-stone-500">Configurable classification thresholds used across the app.</p><div><div className="text-xs text-stone-500 mb-1">🟢 Strong at or above (%)</div><TextInput type="number" value={strong} onChange={(e) => setStrong(e.target.value)} /></div><div><div className="text-xs text-stone-500 mb-1">🟡 Needs Practice at or above (%) — below is Priority</div><TextInput type="number" value={np} onChange={(e) => setNp(e.target.value)} /></div><PrimaryButton onClick={save} icon={CheckCircle2}>Save Thresholds</PrimaryButton></Card></div>);
}

/* ============================== OFFICIAL ASSESSMENTS (Teacher) ============================== */
// Separate from the AI Diagnostic Quiz system above: real question papers + answer sheets,
// AI drafts a question-wise evaluation, and nothing becomes official until a teacher verifies
// and publishes it. Diagnostic quizzes and Personal Practice never feed into this data.

const OA_STEPS = [
  { id: "upload", label: "Upload Materials", icon: Upload },
  { id: "evaluate", label: "AI Evaluation", icon: Brain },
  { id: "verify", label: "Teacher Verification", icon: ShieldCheck },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

function OfficialAssessments({ db, setDb, scope }) {
  const [activeId, setActiveId] = useState(null);
  const [creating, setCreating] = useState(false);
  const myOfficial = db.officialAssessments.filter((a) => scope.classes.some((c) => c.id === a.classId));

  if (creating) return <CreateOfficialAssessment db={db} setDb={setDb} scope={scope} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); setActiveId(id); }} />;

  if (activeId) {
    const a = db.officialAssessments.find((x) => x.id === activeId);
    if (!a) { setActiveId(null); return null; }
    return (
      <div className="space-y-3">
        <button onClick={() => setActiveId(null)} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800"><ChevronLeft size={15} /> Back to Assessment</button>
        <OfficialAssessmentDetail db={db} setDb={setDb} scope={scope} assessment={a} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-black text-stone-800 flex items-center gap-2"><FileText size={22} className="text-indigo-600" /> Assessment</h1><p className="text-stone-500 text-sm">Upload a real question paper &amp; answer sheets — AI drafts the evaluation, you verify before anything is official.</p></div>
        <PrimaryButton icon={Plus} onClick={() => setCreating(true)}>New Assessment</PrimaryButton>
      </div>
      {myOfficial.length === 0 ? <Card className="p-10"><EmptyHint text="No assessments yet. Create one to upload a question paper and start AI-assisted grading." action={() => setCreating(true)} actionLabel="Create Assessment" /></Card> : (
        <div className="grid sm:grid-cols-2 gap-4">
          {[...myOfficial].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).map((a) => {
            const cls = scope.classes.find((c) => c.id === a.classId);
            const withSheets = a.submissions.filter((s) => s.answerSheet).length;
            const published = a.submissions.filter((s) => s.publishedAt).length;
            const tone = a.status === "published" ? "teal" : a.status === "verification" ? "amber" : a.status === "ai_evaluating" ? "indigo" : "neutral";
            const label = a.status === "draft" ? "Draft" : a.status === "materials_uploaded" ? "Materials Ready" : a.status === "ai_evaluating" ? "AI Evaluating" : "Verification";
            return (
              <Card key={a.id} className="p-4 cursor-pointer hover:shadow-md transition" onClick={() => setActiveId(a.id)}>
                <div className="flex items-start justify-between">
                  <div><div className="font-bold text-stone-800">{a.name}</div><div className="text-xs text-stone-400">{a.subjectName} · Class {cls?.name}{cls?.section} {a.chapter && "· " + a.chapter}</div></div>
                  <Badge tone={published > 0 && published === withSheets && withSheets > 0 ? "teal" : tone}>{published > 0 && published === withSheets && withSheets > 0 ? "Published" : label}</Badge>
                </div>
                <div className="mt-2 text-xs text-stone-500">Max marks: {a.maxMarks} · {withSheets} sheet(s) uploaded · {published} published</div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateOfficialAssessment({ db, setDb, scope, onCancel, onCreated }) {
  const [form, setForm] = useState({ name: "", classId: scope.classes[0]?.id || "", subjectId: db.subjects[0]?.id || "", chapter: "", maxMarks: 100 });
  const [error, setError] = useState("");
  const create = async () => {
    setError("");
    if (!form.name.trim() || !form.classId || !form.subjectId || !Number(form.maxMarks)) { setError("Fill in the assessment name, class, subject and maximum marks."); return; }
    const subject = db.subjects.find((s) => s.id === form.subjectId);
    const a = { id: uid(), name: form.name.trim(), classId: form.classId, subjectId: form.subjectId, subjectName: subject?.name || "", chapter: form.chapter.trim(), maxMarks: Number(form.maxMarks), status: "draft", createdAt: new Date().toISOString(), materials: { questionPaper: null, answerKey: null, reference: null }, submissions: [] };
    await setDb({ ...db, officialAssessments: [...db.officialAssessments, a] });
    onCreated(a.id);
  };
  return (
    <div className="max-w-xl space-y-5">
      <button onClick={onCancel} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800"><ChevronLeft size={15} /> Back to Assessment</button>
      <h1 className="text-2xl font-black text-stone-800">New Assessment</h1>
      <Card className="p-5 space-y-3">
        <div><div className="text-xs font-semibold text-stone-500 mb-1">Assessment name</div><TextInput placeholder="e.g. Unit Test 1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className="text-xs font-semibold text-stone-500 mb-1">Class</div><Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}><option value="">Select class</option>{scope.classes.map((c) => <option key={c.id} value={c.id}>Class {c.name}{c.section && "-" + c.section}</option>)}</Select></div>
          <div><div className="text-xs font-semibold text-stone-500 mb-1">Subject</div><Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}><option value="">Select subject</option>{db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        </div>
        <div><div className="text-xs font-semibold text-stone-500 mb-1">Chapter / topic <span className="font-normal text-stone-400">(optional)</span></div><TextInput value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })} /></div>
        <div><div className="text-xs font-semibold text-stone-500 mb-1">Maximum marks</div><TextInput type="number" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} /></div>
        {error && <div className="text-sm text-rose-600 flex items-center gap-1"><AlertTriangle size={14} />{error}</div>}
        {scope.classes.length === 0 && <div className="text-xs text-amber-600">You'll need a class first — you can still create the assessment and add students afterwards.</div>}
        <PrimaryButton icon={Plus} onClick={create} className="w-full justify-center">Create &amp; Continue to Upload</PrimaryButton>
      </Card>
    </div>
  );
}

function OfficialAssessmentDetail({ db, setDb, scope, assessment }) {
  const stepForStatus = { draft: "upload", materials_uploaded: "evaluate", ai_evaluating: "evaluate", verification: "verify", published: "analytics" };
  const [step, setStep] = useState(stepForStatus[assessment.status] || "upload");
  const cls = scope.classes.find((c) => c.id === assessment.classId);
  const classStudents = scope.students.filter((s) => s.classId === assessment.classId);
  const update = async (patch) => { await setDb({ ...db, officialAssessments: db.officialAssessments.map((a) => a.id === assessment.id ? { ...a, ...patch } : a) }); };
  const publishedCount = assessment.submissions.filter((s) => s.publishedAt).length;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div><h1 className="text-2xl font-black text-stone-800">{assessment.name}</h1><p className="text-stone-500 text-sm">{assessment.subjectName} · Class {cls?.name}{cls?.section} {assessment.chapter && "· " + assessment.chapter} · Max marks {assessment.maxMarks}</p></div>
        <Badge tone={publishedCount > 0 ? "teal" : "amber"}>{publishedCount > 0 ? `${publishedCount} Published` : "Official Assessment — Not Yet Published"}</Badge>
      </div>
      <div className="flex gap-1 bg-stone-200/60 p-1 rounded-xl w-fit flex-wrap">
        {OA_STEPS.map((s) => <button key={s.id} onClick={() => setStep(s.id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${step === s.id ? "bg-white shadow-sm text-indigo-700" : "text-stone-500"}`}><s.icon size={13} />{s.label}</button>)}
      </div>
      {step === "upload" && <OAUploadStep assessment={assessment} classStudents={classStudents} update={update} onNext={() => setStep("evaluate")} />}
      {step === "evaluate" && <OAEvaluateStep assessment={assessment} classStudents={classStudents} update={update} onNext={() => setStep("verify")} />}
      {step === "verify" && <OAVerifyStep db={db} assessment={assessment} classStudents={classStudents} update={update} onNext={() => setStep("analytics")} />}
      {step === "analytics" && <OAAnalyticsStep db={db} assessment={assessment} classStudents={classStudents} />}
    </div>
  );
}

function OAFileSlot({ label, fileMeta, onUpload, onRemove, required }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  const handle = async (file) => {
    setBusy(true);
    try { const payload = await fileToPayload(file); const fileId = uid(); await saveFile(fileId, payload); await onUpload({ fileId, name: file.name, mediaType: payload.mediaType }); }
    catch (e) { /* ignore */ }
    setBusy(false);
  };
  return (
    <div>
      {label && <div className="text-xs font-semibold text-stone-500 mb-1">{label}{required && <span className="text-rose-500"> *</span>}</div>}
      {fileMeta ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-teal-200 bg-teal-50 text-sm">
          <FileText size={15} className="text-teal-700 shrink-0" />
          <span className="text-teal-800 font-medium truncate flex-1">{fileMeta.name}</span>
          {!isAIReadable(fileMeta) && <span title="AI can't read this file type — PDF or image only"><AlertTriangle size={14} className="text-amber-500 shrink-0" /></span>}
          <X size={14} className="cursor-pointer text-stone-400 hover:text-rose-500 shrink-0" onClick={onRemove} />
        </div>
      ) : (
        <div onClick={() => ref.current.click()} className="cursor-pointer border-2 border-dashed border-stone-300 rounded-xl px-3 py-2.5 flex items-center gap-2 hover:border-indigo-400 hover:bg-indigo-50/40 transition text-sm">
          {busy ? <Loader2 size={15} className="animate-spin text-stone-400" /> : <Upload size={15} className="text-stone-400" />}
          <span className="text-stone-400">{busy ? "Uploading…" : "Click to upload PDF / JPG / PNG"}</span>
        </div>
      )}
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => e.target.files[0] && handle(e.target.files[0])} />
    </div>
  );
}

function OAUploadStep({ assessment, classStudents, update, onNext }) {
  const materials = assessment.materials;
  const setMaterial = (key) => (fileMeta) => { const materials2 = { ...materials, [key]: fileMeta }; update({ materials: materials2, status: materials2.questionPaper && materials2.answerKey ? "materials_uploaded" : "draft" }); };
  const removeMaterial = (key) => () => { const materials2 = { ...materials, [key]: null }; update({ materials: materials2, status: "draft" }); };
  const submissionFor = (studentId) => assessment.submissions.find((s) => s.studentId === studentId);
  const setAnswerSheet = (studentId) => async (fileMeta) => {
    const existing = submissionFor(studentId);
    const submissions = existing
      ? assessment.submissions.map((s) => s.studentId === studentId ? { ...s, answerSheet: fileMeta, aiStatus: "pending", aiEvaluation: null, teacherFinal: null, publishedAt: null } : s)
      : [...assessment.submissions, { id: uid(), studentId, answerSheet: fileMeta, aiStatus: "pending", aiEvaluation: null, teacherFinal: null, publishedAt: null }];
    await update({ submissions });
  };
  const removeAnswerSheet = (studentId) => async () => { await update({ submissions: assessment.submissions.map((s) => s.studentId === studentId ? { ...s, answerSheet: null, aiStatus: "pending", aiEvaluation: null } : s) }); };
  const ready = materials.questionPaper && materials.answerKey;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="font-bold text-stone-700 text-sm">Assessment materials</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <OAFileSlot label="Question Paper" required fileMeta={materials.questionPaper} onUpload={setMaterial("questionPaper")} onRemove={removeMaterial("questionPaper")} />
          <OAFileSlot label="Answer Key" required fileMeta={materials.answerKey} onUpload={setMaterial("answerKey")} onRemove={removeMaterial("answerKey")} />
          <OAFileSlot label="Reference Material" fileMeta={materials.reference} onUpload={setMaterial("reference")} onRemove={removeMaterial("reference")} />
        </div>
        <div className="text-xs text-stone-400 flex items-center gap-1"><Info size={12} /> Only PDF and image files can be read by the AI. Other file types still upload but show a processing limitation later.</div>
      </Card>
      <Card className="p-5 space-y-1">
        <div className="font-bold text-stone-700 text-sm mb-2">Student answer sheets</div>
        <div className="divide-y divide-stone-100">
          {classStudents.map((s) => { const sub = submissionFor(s.id); return (
            <div key={s.id} className="py-2.5 grid sm:grid-cols-[1fr,2fr] gap-3 items-center">
              <div className="text-sm font-medium text-stone-700">{s.name} <span className="text-xs text-stone-400">Roll {s.rollNo}</span></div>
              <OAFileSlot fileMeta={sub?.answerSheet} onUpload={setAnswerSheet(s.id)} onRemove={removeAnswerSheet(s.id)} />
            </div>
          ); })}
          {classStudents.length === 0 && <div className="text-sm text-stone-400 py-3">No students in this class yet — add students from Classes &amp; Students.</div>}
        </div>
      </Card>
      <div className="flex items-center justify-end gap-3">
        {!ready && <div className="text-xs text-amber-600">Upload at least the question paper and answer key to continue.</div>}
        <PrimaryButton icon={ChevronRight} onClick={onNext} disabled={!ready}>Continue to AI Evaluation</PrimaryButton>
      </div>
    </div>
  );
}

function OAEvaluateStep({ assessment, classStudents, update, onNext }) {
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const materials = assessment.materials;

  const runOne = async (studentId) => {
    const sub = assessment.submissions.find((s) => s.studentId === studentId);
    if (!sub || !sub.answerSheet) return;
    setBusyId(studentId);
    const canRead = isAIReadable(materials.questionPaper) && isAIReadable(materials.answerKey) && isAIReadable(sub.answerSheet);
    if (!canRead) { await update({ submissions: assessment.submissions.map((s) => s.studentId === studentId ? { ...s, aiStatus: "limited" } : s) }); setBusyId(null); return; }
    try {
      const [qp, ak, rf, as] = await Promise.all([getFile(materials.questionPaper.fileId), getFile(materials.answerKey.fileId), materials.reference ? getFile(materials.reference.fileId) : Promise.resolve(null), getFile(sub.answerSheet.fileId)]);
      const result = await evaluateAnswerSheetAI({ subject: assessment.subjectName, chapter: assessment.chapter, maxMarks: assessment.maxMarks, questionPaper: qp, answerKey: ak, reference: rf, answerSheet: as });
      await update({ submissions: assessment.submissions.map((s) => s.studentId === studentId ? { ...s, aiStatus: "done", aiEvaluation: result } : s), status: "ai_evaluating" });
    } catch (e) { await update({ submissions: assessment.submissions.map((s) => s.studentId === studentId ? { ...s, aiStatus: "error" } : s) }); }
    setBusyId(null);
  };
  const runAll = async () => { setBulkBusy(true); for (const s of assessment.submissions) { if (s.answerSheet && s.aiStatus !== "done") await runOne(s.studentId); } setBulkBusy(false); };

  const withSheets = assessment.submissions.filter((s) => s.answerSheet);
  const allHandled = withSheets.length > 0 && withSheets.every((s) => s.aiStatus === "done" || s.aiStatus === "limited");

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-amber-50 border-amber-200 text-xs text-amber-800 flex items-start gap-2"><Info size={14} className="mt-0.5 shrink-0" /><span><b>AI INITIAL EVALUATION — PENDING TEACHER VERIFICATION.</b> AI-suggested marks are never official until a teacher verifies and publishes them.</span></Card>
      {withSheets.length === 0 ? <EmptyHint text="No student answer sheets uploaded yet — go back to Upload Materials." /> : (
        <>
          <div className="flex justify-end"><GhostButton icon={bulkBusy ? Loader2 : Brain} onClick={runAll} disabled={bulkBusy}>{bulkBusy ? "Evaluating…" : "Run AI Evaluation for all"}</GhostButton></div>
          <div className="divide-y divide-stone-100">
            {withSheets.map((sub) => { const student = classStudents.find((s) => s.id === sub.studentId); return (
              <div key={sub.id} className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{student?.name?.slice(0, 1)}</div><div className="font-medium text-stone-700">{student?.name}</div></div>
                <div className="flex items-center gap-2">
                  {sub.aiStatus === "done" && <Badge tone="teal">AI Evaluated · {sub.aiEvaluation?.totalAiMarks}/{assessment.maxMarks}</Badge>}
                  {sub.aiStatus === "limited" && <Badge tone="amber">Teacher Verification Required — file type not readable</Badge>}
                  {sub.aiStatus === "error" && <Badge tone="rose">AI evaluation failed — retry</Badge>}
                  {sub.aiStatus === "pending" && <Badge>Not evaluated</Badge>}
                  <GhostButton icon={busyId === sub.studentId ? Loader2 : RefreshCw} onClick={() => runOne(sub.studentId)} disabled={busyId === sub.studentId}>{busyId === sub.studentId ? "Working…" : sub.aiStatus === "done" ? "Re-run" : "Run"}</GhostButton>
                </div>
              </div>
            ); })}
          </div>
        </>
      )}
      <PrimaryButton icon={ChevronRight} onClick={onNext} disabled={!allHandled} className="ml-auto">Continue to Verification</PrimaryButton>
    </div>
  );
}

function OAVerifyStep({ db, assessment, classStudents, update, onNext }) {
  const [openId, setOpenId] = useState(null);
  const withSheets = assessment.submissions.filter((s) => s.answerSheet && (s.aiStatus === "done" || s.aiStatus === "limited"));

  if (openId) {
    const sub = assessment.submissions.find((s) => s.studentId === openId);
    const student = classStudents.find((s) => s.id === openId);
    return <OAVerifyStudent assessment={assessment} submission={sub} student={student} update={update} onBack={() => setOpenId(null)} />;
  }
  const published = withSheets.filter((s) => s.publishedAt).length;

  return (
    <div className="space-y-3">
      <Card className="p-3 text-xs text-stone-500">{published} / {withSheets.length} student{withSheets.length === 1 ? "" : "s"} verified &amp; published.</Card>
      {withSheets.length === 0 ? <EmptyHint text="Run AI Evaluation first, then come back to verify results." /> : (
        <div className="divide-y divide-stone-100">
          {withSheets.map((sub) => { const student = classStudents.find((s) => s.id === sub.studentId); return (
            <button key={sub.id} onClick={() => setOpenId(sub.studentId)} className="w-full py-3 flex items-center justify-between text-sm hover:bg-stone-50 -mx-1 px-1 rounded">
              <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{student?.name?.slice(0, 1)}</div><div className="font-medium text-stone-700">{student?.name}</div></div>
              <div className="flex items-center gap-2">
                {sub.publishedAt ? <Badge tone="teal">Published · {sub.teacherFinal?.totalMarks}/{assessment.maxMarks}</Badge> : sub.aiStatus === "limited" ? <Badge tone="amber">Manual entry needed</Badge> : <Badge tone="amber">Ready to verify</Badge>}
                <ChevronRight size={15} className="text-stone-300" />
              </div>
            </button>
          ); })}
        </div>
      )}
      <div className="flex justify-end pt-2"><PrimaryButton icon={ChevronRight} onClick={onNext} disabled={published === 0}>Continue to Analytics</PrimaryButton></div>
    </div>
  );
}

function OAVerifyStudent({ assessment, submission, student, update, onBack }) {
  const hasAI = submission.aiStatus === "done" && submission.aiEvaluation;
  const [rows, setRows] = useState(() => hasAI ? submission.aiEvaluation.questions.map((q) => {
    const prior = submission.teacherFinal?.questions?.find((x) => x.questionNumber === q.questionNumber);
    return { ...q, finalMarks: prior ? prior.finalMarks : q.aiMarks, comment: prior?.comment || "" };
  }) : []);
  const [manualTotal, setManualTotal] = useState(submission.teacherFinal?.totalMarks ?? "");
  const [comment, setComment] = useState(submission.teacherFinal?.comment || "");
  const updateRow = (i, patch) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const acceptAI = () => setRows((rs) => rs.map((r) => ({ ...r, finalMarks: r.aiMarks })));
  const totalFinal = hasAI ? rows.reduce((s, r) => s + (Number(r.finalMarks) || 0), 0) : (Number(manualTotal) || 0);

  const publish = async () => {
    const teacherFinal = hasAI
      ? { questions: rows.map((r) => ({ questionNumber: r.questionNumber, finalMarks: Number(r.finalMarks) || 0, comment: r.comment })), totalMarks: totalFinal, comment }
      : { questions: [], totalMarks: totalFinal, comment };
    await update({ submissions: assessment.submissions.map((s) => s.id === submission.id ? { ...s, teacherFinal, publishedAt: new Date().toISOString() } : s), status: "verification" });
    onBack();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={onBack} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800"><ChevronLeft size={15} /> Back</button>
      <div className="flex items-center justify-between"><h2 className="text-lg font-black text-stone-800">{student?.name}</h2>{submission.publishedAt && <Badge tone="teal">Published</Badge>}</div>
      {hasAI ? (
        <>
          <Card className="p-3 bg-indigo-50 border-indigo-200 text-xs text-indigo-800">{submission.aiEvaluation.overallFeedback}</Card>
          <div className="flex justify-end"><GhostButton icon={CheckCircle} onClick={acceptAI}>Accept all AI marks</GhostButton></div>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <Card key={i} className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500 gap-2"><span className="font-semibold text-stone-700">Q{r.questionNumber}. {r.questionText}</span><Badge tone="indigo">{r.topic}</Badge></div>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div><div className="text-stone-400 mb-0.5">Student's answer</div><div className="text-stone-700">{r.studentAnswerSummary}</div></div>
                  <div><div className="text-stone-400 mb-0.5">Expected answer</div><div className="text-stone-700">{r.expectedAnswerSummary}</div></div>
                </div>
                <div className="text-xs text-stone-500">AI feedback: {r.feedback}{r.learningDifficulty && <span className="block text-amber-700 mt-0.5">Possible difficulty: {r.learningDifficulty}</span>}</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="text-xs text-stone-400">AI suggested: {r.aiMarks}/{r.maxMarks}</div>
                  <div className="flex items-center gap-1 text-xs">Final marks: <TextInput type="number" className="!w-16 !py-1" value={r.finalMarks} onChange={(e) => updateRow(i, { finalMarks: e.target.value })} /> / {r.maxMarks}</div>
                </div>
                <TextInput placeholder="Teacher comment (optional)" className="!py-1.5 text-xs" value={r.comment} onChange={(e) => updateRow(i, { comment: e.target.value })} />
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="text-xs text-amber-700 flex items-center gap-2"><AlertTriangle size={14} /> AI couldn't read this file type — review the answer sheet yourself and enter marks manually.</div>
          <div className="flex items-center gap-2 text-sm">Total marks: <TextInput type="number" className="!w-24" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} /> / {assessment.maxMarks}</div>
          <TextInput placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Card>
      )}
      <div className="flex items-center justify-between pt-2"><div className="text-sm font-bold text-stone-700">Total: {totalFinal} / {assessment.maxMarks}</div><PrimaryButton icon={ShieldCheck} onClick={publish}>✅ Verify &amp; Publish</PrimaryButton></div>
    </div>
  );
}

function OAAnalyticsStep({ db, assessment, classStudents }) {
  const published = assessment.submissions.filter((s) => s.publishedAt);
  if (published.length === 0) return <EmptyHint text="No published results yet — verify and publish at least one student in Teacher Verification." />;
  const percents = published.map((s) => (s.teacherFinal.totalMarks / assessment.maxMarks) * 100);
  const avg = percents.reduce((a, b) => a + b, 0) / percents.length;
  const highest = Math.max(...percents), lowest = Math.min(...percents);
  const topicMap = {};
  published.forEach((s) => { (s.teacherFinal.questions || []).forEach((fq) => { const aiQ = s.aiEvaluation?.questions?.find((q) => q.questionNumber === fq.questionNumber); if (!aiQ) return; const pct = aiQ.maxMarks ? (fq.finalMarks / aiQ.maxMarks) * 100 : 0; if (!topicMap[aiQ.topic]) topicMap[aiQ.topic] = []; topicMap[aiQ.topic].push(pct); }); });
  const topicStats = Object.entries(topicMap).map(([topic, arr]) => { const a = arr.reduce((x, y) => x + y, 0) / arr.length; return { topic, avg: a, ...classify(a, db.thresholds) }; });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 text-center"><div className="text-xl font-black text-stone-800">{Math.round(avg)}%</div><div className="text-xs text-stone-500">Class Average</div></Card>
        <Card className="p-4 text-center"><div className="text-xl font-black text-teal-600">{Math.round(highest)}%</div><div className="text-xs text-stone-500">Highest</div></Card>
        <Card className="p-4 text-center"><div className="text-xl font-black text-rose-600">{Math.round(lowest)}%</div><div className="text-xs text-stone-500">Lowest</div></Card>
        <Card className="p-4 text-center"><div className="text-xl font-black text-stone-800">{published.length}</div><div className="text-xs text-stone-500">Published</div></Card>
      </div>
      {topicStats.length > 0 && (
        <Card className="p-4"><div className="font-bold text-stone-700 text-sm mb-3">Topic-wise performance</div><div className="grid sm:grid-cols-2 gap-3">{topicStats.map((t) => <div key={t.topic} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: t.bg }}><div className="flex items-center gap-2 text-sm font-medium" style={{ color: t.color }}>{t.dot} {t.topic}</div><div className="text-sm font-bold" style={{ color: t.color }}>{Math.round(t.avg)}%</div></div>)}</div></Card>
      )}
      <Card className="p-5"><div className="font-bold text-stone-700 text-sm mb-3">Individual results</div><div className="divide-y divide-stone-100">{published.map((s) => { const student = classStudents.find((c) => c.id === s.studentId); const pct = Math.round((s.teacherFinal.totalMarks / assessment.maxMarks) * 100); const c = classify(pct, db.thresholds); return (<div key={s.id} className="py-2.5 flex items-center justify-between text-sm"><div className="text-stone-700 font-medium">{student?.name}</div><div className="flex items-center gap-2"><Badge tone={pct >= db.thresholds.strong ? "teal" : pct >= db.thresholds.needsPractice ? "amber" : "rose"}>{c.dot} {c.label}</Badge><div className="font-bold text-stone-700 w-20 text-right">{s.teacherFinal.totalMarks}/{assessment.maxMarks} ({pct}%)</div></div></div>); })}</div></Card>
    </div>
  );
}

/* ============================== STUDENT APP ============================== */

function StudentApp({ db, setDb, refresh, studentId, onExit }) {
  const [tab, setTab] = useState("performance");
  const [showAccount, setShowAccount] = useState(false);
  const [practiceTopicSeed, setPracticeTopicSeed] = useState("");
  const student = db.students.find((s) => s.id === studentId);
  const nav = [
    { id: "performance", label: "My Performance", icon: BarChart3 },
    { id: "join", label: "Join Live Quiz", icon: Radio },
    { id: "practice", label: "Personal Practice", icon: Target },
    { id: "tutor", label: "Personal AI Tutor", icon: MessageCircle },
  ];
  if (!student) return <EmptyHint text="Student not found." />;
  return (
    <div className="min-h-[640px] flex" style={{ background: COLORS.bg }}>
      <Sidebar nav={nav} tab={tab} setTab={setTab} onExit={onExit} title={student.name} subtitle="Loop Learning AI · Student" onAccount={() => setShowAccount(true)} />
      <div className="flex-1 p-6 overflow-auto max-h-[900px]">
        {tab === "performance" && <div className="max-w-4xl"><h1 className="text-2xl font-black text-stone-800 mb-4">My Performance</h1><StudentOfficialResults db={db} student={student} /><StudentDiagnosticProfile db={db} student={student} /></div>}
        {tab === "join" && <JoinLiveQuiz db={db} setDb={setDb} refresh={refresh} student={student} onGoPractice={(topic) => { setPracticeTopicSeed(topic); setTab("practice"); }} />}
        {tab === "practice" && <PersonalPractice db={db} setDb={setDb} student={student} seedTopic={practiceTopicSeed} />}
        {tab === "tutor" && <PersonalAITutor db={db} setDb={setDb} student={student} />}
      </div>
      {showAccount && <ChangePasswordModal onClose={() => setShowAccount(false)} verifyFn={(pw) => verifyPassword(pw, student.salt, student.passwordHash)} saveFn={async (pw) => { const salt = makeSalt(); const passwordHash = await hashPassword(pw, salt); await setDb({ ...db, students: db.students.map((s) => s.id === student.id ? { ...s, salt, passwordHash } : s) }); }} />}
    </div>
  );
}

function StudentOfficialResults({ db, student }) {
  const mine = db.officialAssessments.filter((a) => a.submissions.some((s) => s.studentId === student.id && s.publishedAt));
  if (mine.length === 0) return null;
  return (
    <Card className="p-5 mb-4">
      <div className="font-bold text-stone-700 text-sm mb-3 flex items-center gap-2"><ShieldCheck size={15} className="text-teal-700" /> Official Assessment Results</div>
      <div className="divide-y divide-stone-100">
        {[...mine].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).map((a) => { const sub = a.submissions.find((s) => s.studentId === student.id); const pct = Math.round((sub.teacherFinal.totalMarks / a.maxMarks) * 100); return (
          <div key={a.id} className="py-2.5 flex items-center justify-between text-sm"><div><div className="font-semibold text-stone-700">{a.name}</div><div className="text-xs text-stone-400">{a.subjectName}{a.chapter ? " · " + a.chapter : ""}</div></div><div className="font-bold text-stone-700">{sub.teacherFinal.totalMarks}/{a.maxMarks} ({pct}%)</div></div>
        ); })}
      </div>
    </Card>
  );
}

/* ---------- Join Live Quiz / Attempt / Result ---------- */

function JoinLiveQuiz({ db, setDb, refresh, student, onGoPractice }) {
  const [code, setCode] = useState(""); const [error, setError] = useState("");
  const [assessment, setAssessment] = useState(null);
  const existingLive = db.assessments.find((a) => a.status === "live" && a.classId === student.classId && db.quizAttempts.some((x) => x.assessmentId === a.id && x.studentId === student.id && x.status === "in_progress"));

  const join = () => {
    setError("");
    const a = db.assessments.find((x) => x.quizCode && x.quizCode.toUpperCase() === code.trim().toUpperCase());
    if (!a) { setError("No live quiz found with that code."); return; }
    if (a.status !== "live") { setError("This quiz is not currently live."); return; }
    if (a.classId !== student.classId) { setError("This quiz is for a different class."); return; }
    const already = db.quizAttempts.find((x) => x.assessmentId === a.id && x.studentId === student.id);
    if (already?.status === "submitted") { setAssessment(a); return; }
    setAssessment(a);
  };

  if (existingLive && !assessment) return <LiveQuizAttempt db={db} setDb={setDb} refresh={refresh} assessment={existingLive} student={student} onGoPractice={onGoPractice} />;
  if (assessment) return <LiveQuizAttempt db={db} setDb={setDb} refresh={refresh} assessment={assessment} student={student} onGoPractice={onGoPractice} onLeave={() => setAssessment(null)} />;

  return (
    <div className="max-w-md space-y-5">
      <div><h1 className="text-2xl font-black text-stone-800 flex items-center gap-2"><Radio size={20} className="text-rose-500" /> Join Live Quiz</h1><p className="text-stone-500 text-sm">Enter the code your teacher shared.</p></div>
      <Card className="p-5 space-y-3">
        <TextInput placeholder="e.g. MATH742" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && join()} className="text-center text-lg font-black tracking-widest" />
        {error && <div className="text-sm text-rose-600 flex items-center gap-1"><AlertTriangle size={14} />{error}</div>}
        <PrimaryButton icon={PlayCircle} onClick={join} className="w-full justify-center">Find Quiz</PrimaryButton>
      </Card>
    </div>
  );
}

function LiveQuizAttempt({ db, setDb, refresh, assessment, student, onGoPractice, onLeave }) {
  const [attempt, setAttempt] = useState(db.quizAttempts.find((a) => a.assessmentId === assessment.id && a.studentId === student.id) || null);
  const [answers, setAnswers] = useState(attempt?.answers || {});
  const [qi, setQi] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [grading, setGrading] = useState(false);
  const questions = assessment.questions;

  const started = () => attempt?.startedAt ? new Date(attempt.startedAt).getTime() : Date.now();
  const [remaining, setRemaining] = useState(assessment.durationMinutes * 60);
  useEffect(() => {
    if (!attempt || attempt.status === "submitted") return;
    const deadline = started() + assessment.durationMinutes * 60 * 1000;
    const tick = () => setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [attempt?.startedAt]);
  useEffect(() => { if (attempt && attempt.status !== "submitted" && remaining === 0) submit(); }, [remaining]);

  const beginAttempt = async () => {
    const a = { id: uid(), assessmentId: assessment.id, studentId: student.id, status: "in_progress", answers: {}, startedAt: new Date().toISOString() };
    await setDb({ ...db, quizAttempts: [...db.quizAttempts, a] }); setAttempt(a);
  };
  const persistAnswers = async (a) => { await setDb({ ...db, quizAttempts: db.quizAttempts.map((x) => x.id === attempt.id ? { ...x, answers: a } : x) }); };
  const setAnswer = (i, val) => { const a = { ...answers, [i]: val }; setAnswers(a); };

  const submit = async () => {
    setGrading(true);
    const subjectiveIdx = questions.map((q, i) => q.type === "subjective" ? i : null).filter((i) => i !== null);
    let subjectiveEvals = {};
    try { if (subjectiveIdx.length) { const items = subjectiveIdx.map((i) => ({ question: questions[i].question, modelAnswer: questions[i].modelAnswer, markingPoints: questions[i].markingPoints, marks: questions[i].marks, studentAnswer: answers[i] || "" })); const results = await evaluateSubjectiveAnswers(items); subjectiveIdx.forEach((qi2, idx) => { subjectiveEvals[qi2] = results[idx]; }); } } catch (e) { /* leave ungraded */ }
    const { score, maxScore, topics } = gradeAttempt(questions, answers, subjectiveEvals, db.thresholds);
    const updated = { ...attempt, status: "submitted", answers, subjectiveEvals, score, maxScore, topics, submittedAt: new Date().toISOString() };
    await setDb({ ...db, quizAttempts: db.quizAttempts.map((x) => x.id === attempt.id ? updated : x) });
    setAttempt(updated); setGrading(false);
  };

  if (!attempt) {
    return (
      <div className="max-w-md space-y-5">
        {onLeave && <button onClick={onLeave} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800"><ChevronLeft size={15} /> Back</button>}
        <Card className="p-5 space-y-2">
          <Badge tone="rose">LIVE QUIZ</Badge>
          <div className="text-xl font-black text-stone-800">{assessment.subjectName} — {assessment.chapter}</div>
          <div className="text-sm text-stone-500">{assessment.questions.length} questions · {assessment.durationMinutes} minutes</div>
          {assessment.instructions && <div className="text-xs text-stone-400 italic">{assessment.instructions}</div>}
          <Badge tone="amber">Diagnostic Assessment — Not an Official School Result</Badge>
          <PrimaryButton icon={PlayCircle} onClick={beginAttempt} className="w-full justify-center mt-2">Start Quiz</PrimaryButton>
        </Card>
      </div>
    );
  }
  if (attempt.status === "submitted") return <DiagnosticResultView assessment={assessment} attempt={attempt} thresholds={db.thresholds} onPractice={onGoPractice} />;

  const q = questions[qi];
  const mins = Math.floor(remaining / 60), secs = remaining % 60;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between"><div className="font-bold text-stone-800">{assessment.subjectName} — {assessment.chapter}</div><div className={`flex items-center gap-1 font-black text-sm ${remaining < 60 ? "text-rose-600" : "text-stone-700"}`}><Clock size={15} />{mins}:{String(secs).padStart(2, "0")}</div></div>
      <div className="flex flex-wrap gap-1.5">{questions.map((_, i) => (<button key={i} onClick={() => setQi(i)} className={`w-8 h-8 rounded-lg text-xs font-bold border ${i === qi ? "bg-indigo-700 text-white border-indigo-700" : answers[i] !== undefined && answers[i] !== "" ? "bg-teal-50 border-teal-300 text-teal-700" : "border-stone-200 text-stone-500"}`}>{i + 1}</button>))}</div>
      <Card className="p-5 space-y-3">
        <div className="text-sm font-medium text-stone-800">{qi + 1}. {q.question} <span className="text-stone-400 font-normal">({q.marks} mark{q.marks > 1 ? "s" : ""})</span></div>
        {q.type === "mcq" && <div className="space-y-1.5">{q.options.map((opt, oi) => <label key={oi} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${answers[qi] === oi ? "border-indigo-400 bg-indigo-50" : "border-stone-200"}`}><input type="radio" name={`q${qi}`} checked={answers[qi] === oi} onChange={() => setAnswer(qi, oi)} />{opt}</label>)}</div>}
        {q.type === "tf" && <div className="flex gap-2">{[true, false].map((v) => <button key={String(v)} onClick={() => setAnswer(qi, v)} className={`px-4 py-1.5 rounded-lg border text-sm font-medium ${answers[qi] === v ? "bg-indigo-700 text-white border-indigo-700" : "border-stone-200"}`}>{v ? "True" : "False"}</button>)}</div>}
        {q.type === "fill" && <TextInput placeholder="Your answer" value={answers[qi] || ""} onChange={(e) => setAnswer(qi, e.target.value)} />}
        {q.type === "subjective" && <textarea rows={4} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="Write your answer…" value={answers[qi] || ""} onChange={(e) => setAnswer(qi, e.target.value)} />}
      </Card>
      <div className="flex items-center justify-between">
        <div className="flex gap-2"><GhostButton icon={ChevronLeft} onClick={() => { persistAnswers(answers); setQi((i) => Math.max(0, i - 1)); }}>Prev</GhostButton><GhostButton icon={ChevronRight} onClick={() => { persistAnswers(answers); setQi((i) => Math.min(questions.length - 1, i + 1)); }}>Next</GhostButton></div>
        {!confirmSubmit ? <PrimaryButton onClick={() => { persistAnswers(answers); setConfirmSubmit(true); }}>Submit Quiz</PrimaryButton> : (<div className="flex items-center gap-2 text-sm"><span className="text-stone-600">Submit now? You can't change answers after.</span><GhostButton onClick={() => setConfirmSubmit(false)}>Cancel</GhostButton><PrimaryButton icon={grading ? Loader2 : CheckCircle2} onClick={submit} disabled={grading}>{grading ? "Grading…" : "Confirm Submit"}</PrimaryButton></div>)}
      </div>
    </div>
  );
}

function DiagnosticResultView({ assessment, attempt, thresholds, studentName, onPractice }) {
  const overall = Math.round((attempt.score / attempt.maxScore) * 100);
  const topics = [...(attempt.topics || [])].sort((a, b) => a.percent - b.percent);
  const strong = topics.filter((t) => t.label === "Strong"); const needs = topics.filter((t) => t.label === "Needs Practice"); const priority = topics.filter((t) => t.label === "Priority");
  const focus = priority[0] || needs[0];
  return (
    <div className="space-y-4">
      <Badge tone="amber">Diagnostic Assessment — Not an Official School Result</Badge>
      <Card className="p-5"><div className="text-sm text-stone-500">{studentName ? studentName + " · " : ""}{assessment.subjectName} — {assessment.chapter}</div><div className="text-3xl font-black text-stone-800">{overall}%</div></Card>
      <Card className="p-5"><div className="font-bold text-stone-700 text-sm mb-3">Learning Profile</div><table className="w-full text-sm"><thead><tr className="text-left text-stone-500 border-b border-stone-200"><th className="py-1">Topic</th><th className="py-1">Score</th><th className="py-1">Status</th></tr></thead><tbody>{topics.map((t) => (<tr key={t.topic} className="border-b border-stone-100"><td className="py-1.5">{t.topic}</td><td className="py-1.5">{t.percent}%</td><td className="py-1.5">{t.dot} {t.label}</td></tr>))}</tbody></table></Card>
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-3"><div className="text-xs font-bold text-teal-700 mb-1">🟢 Strong</div>{strong.length ? strong.map((t) => <div key={t.topic} className="text-xs text-stone-600">{t.topic}</div>) : <div className="text-xs text-stone-400">None yet</div>}</Card>
        <Card className="p-3"><div className="text-xs font-bold text-amber-700 mb-1">🟡 Needs Practice</div>{needs.length ? needs.map((t) => <div key={t.topic} className="text-xs text-stone-600">{t.topic}</div>) : <div className="text-xs text-stone-400">None</div>}</Card>
        <Card className="p-3"><div className="text-xs font-bold text-rose-700 mb-1">🔴 Priority</div>{priority.length ? priority.map((t) => <div key={t.topic} className="text-xs text-stone-600">{t.topic}</div>) : <div className="text-xs text-stone-400">None</div>}</Card>
      </div>
      {focus && <Card className="p-4 bg-indigo-50 border-indigo-200 flex items-center justify-between"><div className="text-sm text-indigo-800">Recommended next step: <b>Start with {focus.topic} practice.</b></div>{onPractice && <PrimaryButton onClick={() => onPractice(focus.topic)}>Start Personal Practice</PrimaryButton>}</Card>}
    </div>
  );
}

/* ---------- Personal Practice ---------- */

function PersonalPractice({ db, setDb, student, seedTopic }) {
  const [subjectId, setSubjectId] = useState(db.subjects[0]?.id || "");
  const [chapter, setChapter] = useState(""); const [topic, setTopic] = useState(seedTopic || "");
  const [difficulty, setDifficulty] = useState("Medium"); const [selectedTypes, setSelectedTypes] = useState(["mcq"]); const [countPerType, setCountPerType] = useState(3);
  const [quiz, setQuiz] = useState(null); const [answers, setAnswers] = useState({}); const [submitted, setSubmitted] = useState(false);
  const [evaluations, setEvaluations] = useState({}); const [loading, setLoading] = useState(false); const [grading, setGrading] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (seedTopic) setTopic(seedTopic); }, [seedTopic]);

  const subject = db.subjects.find((s) => s.id === subjectId);
  const myAttempts = db.quizAttempts.filter((a) => a.studentId === student.id && a.status === "submitted");
  const topicAgg = {}; myAttempts.forEach((a) => (a.topics || []).forEach((t) => { topicAgg[t.topic] = t.percent; }));
  const recommended = Object.entries(topicAgg).filter(([, p]) => p < db.thresholds.needsPractice).map(([t]) => t);
  const toggleType = (id) => setSelectedTypes((t) => t.includes(id) ? t.filter((x) => x !== id) : [...t, id]);
  const totalQuestions = selectedTypes.length * countPerType;

  const generate = async () => {
    if (!topic.trim() || !subject) { setError("Choose a subject and topic first."); return; }
    if (selectedTypes.length === 0) { setError("Select at least one question type."); return; }
    if (totalQuestions > 8) { setError("Keep the total to 8 questions or fewer for reliable generation."); return; }
    setLoading(true); setError(""); setQuiz(null); setSubmitted(false); setAnswers({}); setEvaluations({});
    try { const spec = selectedTypes.map((id) => ({ id, count: countPerType })); const q = await generatePracticeQuiz({ subject: subject.name, chapter, topic, difficulty, spec }); setQuiz(q.questions || []); }
    catch (e) { setError(e?.message || "AI is temporarily unavailable. Please try again in a moment."); }
    setLoading(false);
  };
  const objectiveScore = () => quiz ? quiz.reduce((acc, q, i) => acc + (q.type === "subjective" ? 0 : gradeQuestion(q, answers[i])), 0) : 0;
  const finishAndSave = async () => {
    setGrading(true);
    const subjectiveIdx = quiz.map((q, i) => q.type === "subjective" ? i : null).filter((i) => i !== null);
    let evals = {};
    try { if (subjectiveIdx.length) { const items = subjectiveIdx.map((i) => ({ question: quiz[i].question, modelAnswer: quiz[i].modelAnswer, markingPoints: quiz[i].markingPoints, marks: quiz[i].marks, studentAnswer: answers[i] || "" })); const results = await evaluateSubjectiveAnswers(items); subjectiveIdx.forEach((qi, idx) => { evals[qi] = results[idx]; }); } } catch (e) { }
    setEvaluations(evals);
    const total = objectiveScore() + subjectiveIdx.reduce((s, i) => s + (evals[i]?.marksAwarded || 0), 0);
    const maxTotal = quiz.reduce((s, q) => s + q.marks, 0);
    setGrading(false); setSubmitted(true);
    await setDb({ ...db, practiceSessions: [...db.practiceSessions, { id: uid(), studentId: student.id, subject: subject.name, topic, difficulty, score: total, total: maxTotal, timestamp: new Date().toISOString() }] });
  };
  const allAnswered = quiz && quiz.every((q, i) => answers[i] !== undefined && answers[i] !== "");
  const mySessions = db.practiceSessions.filter((p) => p.studentId === student.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div className="max-w-3xl space-y-5">
      <div><h1 className="text-2xl font-black text-stone-800">Personal Practice</h1><Badge tone="amber">Personal Practice — Not an Official Assessment</Badge></div>
      {recommended.length > 0 && !quiz && <Card className="p-4 bg-indigo-50 border-indigo-200"><div className="text-sm text-indigo-800 font-medium mb-2">Based on your diagnostic results, you may want to practise:</div><div className="flex flex-wrap gap-2">{recommended.map((t) => <button key={t} onClick={() => setTopic(t)} className="px-3 py-1 rounded-full bg-white border border-indigo-200 text-xs font-medium text-indigo-700 hover:bg-indigo-100">{t}</button>)}</div></Card>}
      {!quiz && (<Card className="p-5 space-y-3">
        <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>{db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <TextInput placeholder="Chapter (optional)" value={chapter} onChange={(e) => setChapter(e.target.value)} />
        <TextInput placeholder="Topic (e.g. Pythagoras Theorem)" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <div><div className="text-xs font-semibold text-stone-500 mb-1.5">Question type(s)</div><div className="flex flex-wrap gap-2">{QUESTION_TYPES.map((qt) => <button key={qt.id} onClick={() => toggleType(qt.id)} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${selectedTypes.includes(qt.id) ? "bg-indigo-700 text-white border-indigo-700" : "bg-white border-stone-200 text-stone-600"}`}>{qt.label}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><div><div className="text-xs text-stone-500 mb-1">Questions per type</div><TextInput type="number" min={1} max={5} value={countPerType} onChange={(e) => setCountPerType(Number(e.target.value))} /></div><div><div className="text-xs text-stone-500 mb-1">Difficulty</div><Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option></Select></div></div>
        <div className="text-xs text-stone-400">Total questions: {totalQuestions}{totalQuestions > 8 && <span className="text-rose-500"> — reduce to 8 or fewer</span>}</div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <PrimaryButton icon={loading ? Loader2 : Sparkles} onClick={generate} disabled={loading} className="w-full justify-center">{loading ? "Generating quiz…" : "Start Quiz"}</PrimaryButton>
      </Card>)}
      {quiz && !submitted && (<Card className="p-5 space-y-5"><div className="text-sm font-semibold text-stone-700">{subject?.name} · {topic} · {difficulty}</div>{quiz.map((q, i) => (<div key={i}><div className="text-sm font-medium text-stone-800 mb-2">{i + 1}. {q.question} <span className="text-stone-400 font-normal">({q.marks} mark{q.marks > 1 ? "s" : ""})</span></div>{q.type === "mcq" && <div className="space-y-1.5">{q.options.map((opt, oi) => <label key={oi} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${answers[i] === oi ? "border-indigo-400 bg-indigo-50" : "border-stone-200"}`}><input type="radio" name={`q${i}`} checked={answers[i] === oi} onChange={() => setAnswers({ ...answers, [i]: oi })} />{opt}</label>)}</div>}{q.type === "tf" && <div className="flex gap-2">{[true, false].map((v) => <button key={String(v)} onClick={() => setAnswers({ ...answers, [i]: v })} className={`px-4 py-1.5 rounded-lg border text-sm font-medium ${answers[i] === v ? "bg-indigo-700 text-white border-indigo-700" : "border-stone-200 text-stone-600"}`}>{v ? "True" : "False"}</button>)}</div>}{q.type === "fill" && <TextInput placeholder="Your answer" value={answers[i] || ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />}{q.type === "subjective" && <textarea rows={3} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="Write your answer…" value={answers[i] || ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />}</div>))}<PrimaryButton icon={grading ? Loader2 : CheckCircle2} onClick={finishAndSave} disabled={!allAnswered || grading} className="w-full justify-center">{grading ? "Grading…" : "Submit Practice Quiz"}</PrimaryButton></Card>)}
      {quiz && submitted && (<Card className="p-5 space-y-4"><div className="flex items-center justify-between"><div className="text-lg font-black text-stone-800">Score: {(objectiveScore() + Object.values(evaluations).reduce((s, e) => s + (e.marksAwarded || 0), 0)).toFixed(1)} / {quiz.reduce((s, q) => s + q.marks, 0)}</div><Badge tone="amber">Personal Practice — Not Official</Badge></div>{quiz.map((q, i) => { if (q.type === "subjective") { const e = evaluations[i]; return (<div key={i} className="p-3 rounded-xl bg-stone-50 text-sm"><div className="font-medium text-stone-800 mb-1">{i + 1}. {q.question}</div><div className="text-stone-500 text-xs mb-1">Your answer: {answers[i]}</div>{e ? (<><div className="font-bold text-indigo-700 text-xs mb-1">{e.marksAwarded} / {q.marks} marks</div><div className="text-xs text-teal-700">✓ {e.whatWasCorrect}</div><div className="text-xs text-rose-600">Missing: {e.whatWasMissing}</div><div className="text-xs text-stone-500">Concept: {e.misunderstoodConcept}</div><div className="text-xs text-indigo-600">Next: {e.nextPractice}</div></>) : <div className="text-xs text-stone-400">Model answer: {q.modelAnswer}</div>}<div className="mt-2 text-xs text-stone-600"><div className="font-semibold text-stone-700">How to solve it</div>{(q.solutionSteps || [q.explanation]).map((step, stepIndex) => <div key={stepIndex}>{stepIndex + 1}. {step}</div>)}</div></div>); } const correct = q.type === "mcq" ? answers[i] === q.correctIndex : q.type === "tf" ? answers[i] === q.correctAnswer : (answers[i] || "").trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase(); return (<div key={i} className={`p-3 rounded-xl text-sm ${correct ? "bg-teal-50" : "bg-rose-50"}`}><div className="font-medium text-stone-800 mb-1">{i + 1}. {q.question}</div><div className={correct ? "text-teal-700" : "text-rose-700"}>Your answer: {q.type === "mcq" ? q.options[answers[i]] : q.type === "tf" ? (answers[i] ? "True" : "False") : answers[i]} {correct ? "✓" : "✗"}</div>{!correct && <div className="text-stone-600">Correct answer: {q.type === "mcq" ? q.options[q.correctIndex] : q.type === "tf" ? (q.correctAnswer ? "True" : "False") : q.correctAnswer}</div>}<div className="mt-2 text-xs text-stone-600"><div className="font-semibold text-stone-700">How to solve it</div>{(q.solutionSteps || [q.explanation]).map((step, stepIndex) => <div key={stepIndex}>{stepIndex + 1}. {step}</div>)}</div></div>); })}<GhostButton onClick={() => { setQuiz(null); setSubmitted(false); }} icon={RefreshCw}>Practise another topic</GhostButton></Card>)}
      {mySessions.length > 0 && !quiz && <Card className="p-5"><div className="font-bold text-stone-700 text-sm mb-3">Recent practice <span className="font-normal text-stone-400">(private)</span></div><div className="divide-y divide-stone-100">{mySessions.slice(0, 6).map((s) => <div key={s.id} className="py-2 flex items-center justify-between text-sm"><div className="text-stone-700">{s.subject} · {s.topic}</div><div className="text-stone-500">{s.score}/{s.total}</div></div>)}</div></Card>}
    </div>
  );
}

/* ---------- Personal AI Tutor ---------- */

const QUICK_ACTIONS = ["Explain this concept", "Simplify this topic", "Give me an example", "Give me another example", "Test me", "Explain my mistake", "Ask me practice questions", "Help me revise", "Summarise this chapter", "Give me a diagram", "Explain using a graph", "Explain step-by-step"];

function PersonalAITutor({ db, setDb, student }) {
  const [subjectId, setSubjectId] = useState(db.subjects[0]?.id || "");
  const [topic, setTopic] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const subject = db.subjects.find((s) => s.id === subjectId);
  const myMaterials = db.studentMaterials.filter((m) => m.studentId === student.id).slice(-4);

  const latestAttempt = db.quizAttempts.filter((a) => a.studentId === student.id && a.status === "submitted").sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))[0];
  const priorityTopic = latestAttempt?.topics?.find((t) => t.label === "Priority");

  const uploadMaterial = async (file) => {
    setUploading(true);
    try { const payload = await fileToPayload(file); const fileId = uid(); await saveFile(fileId, payload); await setDb({ ...db, studentMaterials: [...db.studentMaterials, { id: uid(), studentId: student.id, fileId, name: file.name, uploadedAt: new Date().toISOString() }] }); }
    catch (e) { /* ignore */ }
    setUploading(false);
  };
  const removeMaterial = async (id) => setDb({ ...db, studentMaterials: db.studentMaterials.filter((m) => m.id !== id) });

  const send = async (text) => {
    const q = (text ?? input).trim(); if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]); setInput(""); setLoading(true);
    try {
      const files = await Promise.all(myMaterials.slice(-2).map((m) => getFile(m.fileId)));
      const result = await askDoubt({ subject: subject?.name, topic, question: q, materials: files.filter(Boolean) });
      setMessages((m) => [...m, { role: "ai", text: result.explanation, visual: result.visual }]);
    } catch (e) { setMessages((m) => [...m, { role: "ai", text: e?.message || "AI is temporarily unavailable. Please try again in a moment." }]); }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div><h1 className="text-2xl font-black text-stone-800">Personal AI Tutor</h1><p className="text-xs text-stone-400">Private to you. Renders real diagrams, graphs, flowcharts and tables where they help — this environment can't generate photographic images, so the tutor will say so rather than fake one.</p></div>
      {priorityTopic && <Card className="p-3 bg-rose-50 border-rose-200 text-sm text-rose-800">Your recent diagnostic assessment suggests <b>{priorityTopic.topic}</b> may need more practice. Let's work through it step by step. <button className="underline ml-1" onClick={() => { setTopic(priorityTopic.topic); send(`Explain ${priorityTopic.topic} step by step`); }}>Start now</button></Card>}
      <div className="flex gap-3"><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>{db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><TextInput placeholder="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} /></div>

      <div>
        <div className="text-xs font-semibold text-stone-500 mb-1 flex items-center gap-1"><Paperclip size={12} /> Study material</div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {myMaterials.map((m) => <span key={m.id} className="px-2 py-1 rounded-full bg-stone-100 text-xs text-stone-600 flex items-center gap-1">{m.name}<X size={11} className="cursor-pointer" onClick={() => removeMaterial(m.id)} /></span>)}
          <FileUploadChip onFile={uploadMaterial} busy={uploading} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">{QUICK_ACTIONS.map((a) => <button key={a} onClick={() => send(a + (topic ? ` (${topic})` : ""))} className="px-2.5 py-1 rounded-full text-xs font-medium border border-stone-200 text-stone-600 hover:border-indigo-300 hover:text-indigo-700">{a}</button>)}</div>
      <Card className="p-4 h-96 overflow-auto flex flex-col gap-3">
        {messages.length === 0 && <div className="text-sm text-stone-400 m-auto text-center">Ask a question, or tap a quick action above.</div>}
        {messages.map((m, i) => (<div key={i} className={`max-w-[90%] ${m.role === "user" ? "self-end" : "self-start"}`}><div className={`px-3 py-2 rounded-xl text-sm ${m.role === "user" ? "bg-indigo-700 text-white" : "bg-stone-100 text-stone-700"}`}>{m.text}</div>{m.role === "ai" && <VisualBlock visual={m.visual} />}</div>))}
        {loading && <div className="self-start text-stone-400 text-sm flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Thinking…</div>}
      </Card>
      <div className="flex gap-2"><TextInput placeholder="Type your question…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} /><PrimaryButton icon={Send} onClick={() => send()} disabled={loading}>Ask</PrimaryButton></div>
    </div>
  );
}
function FileUploadChip({ onFile, busy }) {
  const ref = useRef();
  return (<><button onClick={() => ref.current.click()} disabled={busy} className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-stone-300 text-stone-500 hover:border-indigo-400 flex items-center gap-1">{busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload</button><input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} /></>);
}
