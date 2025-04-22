import express from 'express';
import multer from 'multer';
import { Request, Response } from 'express';
import * as csv from 'fast-csv';
import ExcelJS from 'exceljs';
import { marked } from 'marked';
import puppeteer from 'puppeteer';
import archiver from 'archiver';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

interface FeedbackData {
    Year: string;
    Term: string;
    Branch: string;
    Sem: string;
    Term_Start: string;
    Term_End: string;
    Subject_Code: string;
    Subject_FullName: string;
    Faculty_Name: string;
    [key: string]: string; // For Q1-Q12
}

interface AnalysisResult {
    subject_scores: any[];
    faculty_scores: any[];
    semester_scores: any[];
    branch_scores: any[];
    term_year_scores: any[];
    correlation_matrix: { [key: string]: { [key: string]: number } };
}

router.get('/sample', (_req: Request, res: Response) => {
    const sampleData = `Year,Term,Branch,Sem,Term_Start,Term_End,Subject_Code,Subject_FullName,Faculty_Name,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10,Q11,Q12
2025,Even,EC,2,24/01/25,10/05/25,DI02000051,Environmental Sustainability,Mr. N J Chauhan,5,5,5,5,5,5,5,5,5,5,5,5`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sample_feedback.csv');
    res.send(sampleData);
});

router.post('/analyze', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const fileContent = req.file.buffer.toString();
        
        // Early return for empty file
        if (!fileContent) {
            res.status(400).json({ error: 'Empty file uploaded' });
            return;
        }
        
        const feedbackData: FeedbackData[] = [];
        
        await new Promise((resolve, reject) => {
            csv.parseString(fileContent, { headers: true })
                .on('data', (row: FeedbackData) => feedbackData.push(row))
                .on('error', reject)
                .on('end', resolve);
        });

        // Calculate subject-wise scores
        const subjectScores = calculateSubjectScores(feedbackData);
        
        // Calculate faculty-wise scores
        const facultyScores = calculateFacultyScores(subjectScores);
        
        // Calculate semester-wise scores
        const semesterScores = calculateSemesterScores(feedbackData);

        // Calculate branch scores
        const branchScores = calculateBranchScores(feedbackData);

        // Calculate term-year scores
        const termYearScores = calculateTermYearScores(feedbackData);

        // Calculate correlation matrix
        const correlationMatrix = calculateCorrelationMatrix(subjectScores, facultyScores);

        const analysisResult: AnalysisResult = {
            subject_scores: subjectScores,
            faculty_scores: facultyScores,
            semester_scores: semesterScores,
            branch_scores: branchScores,
            term_year_scores: termYearScores,
            correlation_matrix: correlationMatrix
        };

        // Generate reports
        const markdownReport = generateMarkdownReport(analysisResult);
        await generateExcelReport(analysisResult, fileContent);
        await generatePDF(await marked(markdownReport));

        // Create zip archive
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.append(markdownReport, { name: 'feedback_report.md' });
        archive.file('feedback_report.xlsx', { name: 'feedback_report.xlsx' });
        archive.file('feedback_report.pdf', { name: 'feedback_report.pdf' });
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename=feedback_reports.zip');
        archive.pipe(res);
        await archive.finalize();

    } catch (error) {
        console.error('Error processing feedback:', error);
        res.status(500).json({ error: 'Error processing feedback data' });
        return;
    }
});

const getFacultyInitial = (name: string): string => {
    return name
        .split(' ')
        .slice(2) // Skip 'Mr.'/'Ms.' and middle initial
        .map(part => part[0])
        .join('');
};

const generateMarkdownReport = (result: AnalysisResult): string => {
    const formatFloat = (x: number): string => x.toFixed(2);

    let report = `# Student Feedback Analysis Report\n\n`;

    // Add branch analysis
    report += `## Branch Analysis\n\n`;
    report += `| Branch | ${Array.from({ length: 12 }, (_, i) => `Q${i + 1}`).join(' | ')} | Score |\n`;
    report += `|--------|${Array.from({ length: 13 }, () => '------').join('|')}|\n`;
    result.branch_scores.forEach(branch => {
        report += `| ${branch.Branch} | ${Array.from({ length: 12 }, (_, i) => formatFloat(branch[`Q${i + 1}`])).join(' | ')} | ${formatFloat(branch.Score)} |\n`;
    });
    report += `\n`;

    // Add term-year analysis
    report += `## Term-Year Analysis\n\n`;
    report += `| Year | Term | ${Array.from({ length: 12 }, (_, i) => `Q${i + 1}`).join(' | ')} | Score |\n`;
    report += `|------|------|${Array.from({ length: 13 }, () => '------').join('|')}|\n`;
    result.term_year_scores.forEach(ty => {
        report += `| ${ty.Year} | ${ty.Term} | ${Array.from({ length: 12 }, (_, i) => formatFloat(ty[`Q${i + 1}`])).join(' | ')} | ${formatFloat(ty.Score)} |\n`;
    });
    report += `\n`;

    // Add semester analysis
    report += `## Semester Analysis\n\n`;
    report += `| Branch | Sem | ${Array.from({ length: 12 }, (_, i) => `Q${i + 1}`).join(' | ')} | Score |\n`;
    report += `|--------|-----|${Array.from({ length: 13 }, () => '------').join('|')}|\n`;
    result.semester_scores.forEach(sem => {
        report += `| ${sem.Branch} | ${sem.Sem} | ${Array.from({ length: 12 }, (_, i) => formatFloat(sem[`Q${i + 1}`])).join(' | ')} | ${formatFloat(sem.Score)} |\n`;
    });
    report += `\n`;

    // Add faculty analysis
    report += `## Faculty Analysis\n\n`;
    report += `| Faculty | ${Array.from({ length: 12 }, (_, i) => `Q${i + 1}`).join(' | ')} | Score |\n`;
    report += `|---------|${Array.from({ length: 13 }, () => '------').join('|')}|\n`;
    result.faculty_scores.forEach(faculty => {
        report += `| ${faculty.Faculty_Initial} | ${Array.from({ length: 12 }, (_, i) => formatFloat(faculty[`Q${i + 1}`])).join(' | ')} | ${formatFloat(faculty.Score)} |\n`;
    });
    report += `\n`;

    // Add correlation matrix
    report += `## Faculty-Subject Correlation Matrix\n\n`;
    const facultyInitials = result.faculty_scores.map(f => f.Faculty_Initial);
    report += `| Subject | ${facultyInitials.join(' | ')} |\n`;
    report += `|---------|${Array.from({ length: facultyInitials.length }, () => '------').join('|')}|\n`;
    Object.entries(result.correlation_matrix).forEach(([subject, scores]) => {
        report += `| ${subject} | ${facultyInitials.map(fi => formatFloat((scores as { [key: string]: number })[fi] || 0)).join(' | ')} |\n`;
    });

    return report;
};

const generateExcelReport = async (analysis: AnalysisResult, originalData: string): Promise<void> => {
    const workbook = new ExcelJS.Workbook();

    // Add original data sheet
    const originalSheet = workbook.addWorksheet('Original Data');
    const rows = originalData.split('\n').map(line => line.split(','));
    originalSheet.addRows(rows);

    // Add analysis sheets
    for (const [sheetName, data] of Object.entries(analysis)) {
        const sheet = workbook.addWorksheet(sheetName);
        if (Array.isArray(data)) {
            const headers = Object.keys(data[0] || {});
            sheet.addRow(headers);
            data.forEach(row => sheet.addRow(Object.values(row)));
        }
    }

    await workbook.xlsx.writeFile('feedback_report.xlsx');
};

const generatePDF = (htmlContent: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        try {
            const browser = await puppeteer.launch();
            const page = await browser.newPage();
            await page.setContent(htmlContent);
            await page.pdf({ path: 'feedback_report.pdf', format: 'A4' });
            await browser.close();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

function calculateSubjectScores(data: FeedbackData[]): any[] {
    const subjects = new Map<string, {
        Subject_Code: string;
        Subject_FullName: string;
        Faculty_Name: string;
        scores: { [key: string]: number };
        count: number;
    }>();
    
    data.forEach(row => {
        const key = `${row.Subject_Code}-${row.Faculty_Name}`;
        if (!subjects.has(key)) {
            subjects.set(key, {
                Subject_Code: row.Subject_Code,
                Subject_FullName: row.Subject_FullName,
                Faculty_Name: row.Faculty_Name,
                scores: {},
                count: 0
            });
        }
        
        const subject = subjects.get(key);
        if (!subject) return;
        for (let i = 1; i <= 12; i++) {
            const qKey = `Q${i}`;
            if (!subject.scores[qKey]) subject.scores[qKey] = 0;
            subject.scores[qKey] += Number(row[qKey]);
        }
        subject.count++;
    });

    return Array.from(subjects.values()).map(subject => {
        const averageScores = Object.fromEntries(
            Object.entries(subject.scores).map(([key, score]) => [key, score / subject.count])
        );
        const overallScore = Object.values(subject.scores).reduce((a, b) => a + b, 0) / (subject.count * 12);

        return {
            Subject_Code: subject.Subject_Code,
            Subject_FullName: subject.Subject_FullName,
            Faculty_Name: subject.Faculty_Name,
            ...averageScores,
            Score: overallScore
        };
    });
}

function calculateFacultyScores(subjectScores: any[]) {
    const facultyScores = new Map<string, {
        scores: { [key: string]: number };
        count: number;
    }>();

    subjectScores.forEach(subject => {
        if (!facultyScores.has(subject.Faculty_Name)) {
            facultyScores.set(subject.Faculty_Name, {
                scores: {},
                count: 0
            });
        }

        const faculty = facultyScores.get(subject.Faculty_Name);
        if (!faculty) return;

        for (let i = 1; i <= 12; i++) {
            const qKey = `Q${i}`;
            if (!faculty.scores[qKey]) faculty.scores[qKey] = 0;
            faculty.scores[qKey] += subject[qKey];
        }
        faculty.count++;
    });

    return Array.from(facultyScores.entries()).map(([name, faculty]) => {
        const averageScores = Object.fromEntries(
            Object.entries(faculty.scores).map(([key, score]) => [key, score / faculty.count])
        );
        const overallScore = Object.values(faculty.scores).reduce((a, b) => a + b, 0) / (faculty.count * 12);

        return {
            Faculty_Name: name,
            Faculty_Initial: getFacultyInitial(name),
            ...averageScores,
            Score: overallScore
        };
    });
}

function calculateSemesterScores(data: FeedbackData[]) {
    const semesterScores = new Map<string, {
        Year: string;
        Term: string;
        Branch: string;
        Sem: string;
        scores: { [key: string]: number };
        count: number;
    }>();

    data.forEach(row => {
        const key = `${row.Year}-${row.Term}-${row.Branch}-${row.Sem}`;
        if (!semesterScores.has(key)) {
            semesterScores.set(key, {
                Year: row.Year,
                Term: row.Term,
                Branch: row.Branch,
                Sem: row.Sem,
                scores: {},
                count: 0
            });
        }

        const semester = semesterScores.get(key);
        if (!semester) return;

        for (let i = 1; i <= 12; i++) {
            const qKey = `Q${i}`;
            if (!semester.scores[qKey]) semester.scores[qKey] = 0;
            semester.scores[qKey] += Number(row[qKey]);
        }
        semester.count++;
    });

    return Array.from(semesterScores.values()).map(semester => {
        const averageScores = Object.fromEntries(
            Object.entries(semester.scores).map(([key, score]) => [key, score / semester.count])
        );
        const overallScore = Object.values(semester.scores).reduce((a, b) => a + b, 0) / (semester.count * 12);

        return {
            Year: semester.Year,
            Term: semester.Term,
            Branch: semester.Branch,
            Sem: semester.Sem,
            ...averageScores,
            Score: overallScore
        };
    });
}

function calculateBranchScores(data: FeedbackData[]) {
    const branchScores = new Map<string, {
        Branch: string;
        scores: { [key: string]: number };
        count: number;
    }>();

    data.forEach(row => {
        if (!branchScores.has(row.Branch)) {
            branchScores.set(row.Branch, {
                Branch: row.Branch,
                scores: {},
                count: 0
            });
        }

        const branch = branchScores.get(row.Branch);
        if (!branch) return;

        for (let i = 1; i <= 12; i++) {
            const qKey = `Q${i}`;
            if (!branch.scores[qKey]) branch.scores[qKey] = 0;
            branch.scores[qKey] += Number(row[qKey]);
        }
        branch.count++;
    });

    return Array.from(branchScores.values()).map(branch => {
        const averageScores = Object.fromEntries(
            Object.entries(branch.scores).map(([key, score]) => [key, score / branch.count])
        );
        const overallScore = Object.values(branch.scores).reduce((a, b) => a + b, 0) / (branch.count * 12);

        return {
            Branch: branch.Branch,
            ...averageScores,
            Score: overallScore
        };
    });
}

function calculateTermYearScores(data: FeedbackData[]) {
    const termYearScores = new Map<string, {
        Year: string;
        Term: string;
        scores: { [key: string]: number };
        count: number;
    }>();

    data.forEach(row => {
        const key = `${row.Year}-${row.Term}`;
        if (!termYearScores.has(key)) {
            termYearScores.set(key, {
                Year: row.Year,
                Term: row.Term,
                scores: {},
                count: 0
            });
        }

        const termYear = termYearScores.get(key);
        if (!termYear) return;

        for (let i = 1; i <= 12; i++) {
            const qKey = `Q${i}`;
            if (!termYear.scores[qKey]) termYear.scores[qKey] = 0;
            termYear.scores[qKey] += Number(row[qKey]);
        }
        termYear.count++;
    });

    return Array.from(termYearScores.values()).map(termYear => {
        const averageScores = Object.fromEntries(
            Object.entries(termYear.scores).map(([key, score]) => [key, score / termYear.count])
        );
        const overallScore = Object.values(termYear.scores).reduce((a, b) => a + b, 0) / (termYear.count * 12);

        return {
            Year: termYear.Year,
            Term: termYear.Term,
            ...averageScores,
            Score: overallScore
        };
    });
}

function calculateCorrelationMatrix(subjects: any[], faculties: any[]): { [key: string]: { [key: string]: number } } {
    const matrix: { [key: string]: { [key: string]: number } } = {};

    // Initialize matrix with subject rows
    subjects.forEach(subject => {
        const key = `${subject.Subject_Code}-${subject.Subject_FullName}`;
        matrix[key] = {};
        faculties.forEach(faculty => {
            matrix[key][faculty.Faculty_Initial] = 0;
        });
    });

    // Fill in scores
    subjects.forEach(subject => {
        const key = `${subject.Subject_Code}-${subject.Subject_FullName}`;
        const facultyInitial = getFacultyInitial(subject.Faculty_Name);
        matrix[key][facultyInitial] = subject.Score;
    });

    return matrix;
}

export default router;
