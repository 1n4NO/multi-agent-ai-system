import jsPDF from "jspdf";
import { loadImageAsBase64 } from "./loadImage";

type ExportableRunResult = {
	planner?: string;
	researchers?: string[];
	synthesizer?: string;
	writer?: string;
	critic?: string;
};

const LOGO_RATIO = 1382 / 752;

const getLogoSize = (targetWidth: number) => {
	return {
		width: targetWidth,
		height: targetWidth / LOGO_RATIO,
	};
};

export function copyToClipboard(text: string) {
	navigator.clipboard.writeText(text);
}

export async function exportToPDF(title: string, data?: ExportableRunResult) {
	const doc = new jsPDF();

	if (!data) return;

	const addSubtleDivider = () => {
		doc.setDrawColor(230);
		doc.line(marginX, cursorY, marginX + pageWidth, cursorY);
		cursorY += 8;
	};

	// 📊 Extract score from critic
	const extractScore = (text: string): number => {
		if (!text) return 0;
		const match = text.match(/(\d+)%/);
		return match ? parseInt(match[1]) : 0;
	};

	// 📊 Draw progress bar
	const drawBar = (
		label: string,
		value: number,
		max = 100
	) => {
		const barWidth = 120;
		const barHeight = 6;

		if (cursorY > pageHeight - 30) addPage();

		// Label
		doc.setFont("Helvetica", "normal");
		doc.setFontSize(11);
		doc.text(label, marginX, cursorY);

		cursorY += 4;

		// Background
		doc.setFillColor(230, 230, 230);
		doc.rect(marginX, cursorY, barWidth, barHeight, "F");

		// Fill
		const fillWidth = (value / max) * barWidth;

		doc.setFillColor(25, 118, 210); // nice blue
		doc.rect(marginX, cursorY, fillWidth, barHeight, "F");

		// Value text
		doc.setFontSize(10);
		doc.text(`${value}%`, marginX + barWidth + 5, cursorY + 5);

		cursorY += 12;
	};

	// 🔥 Load logo
	const logo = await loadImageAsBase64("/logo.png");

	const marginX = 20;
	const pageWidth = 170;
	const pageHeight = 280;

	let cursorY = 20;

	// 🧠 Helpers
	const addPage = () => {
		doc.addPage();
		cursorY = 25;

		// 🔥 Small logo on every page
		const headerLogo = getLogoSize(30);

		doc.addImage(
			logo,
			"PNG",
			210 - headerLogo.width - 10,
			8,
			headerLogo.width,
			headerLogo.height
		);

		// Divider
		doc.setDrawColor(220);
		doc.line(20, 20, 190, 20);
	};

	const addSection = (title: string, content?: string) => {
		if (!content) return;

		if (cursorY > pageHeight - 40) addPage();

		doc.setFont("Helvetica", "bold");
		doc.setFontSize(14);
		doc.text(title, marginX, cursorY);

		cursorY += 8;

		doc.setFont("Helvetica", "normal");
		doc.setFontSize(11);

		const clean = String(content)
			.replace(/\*\*/g, "")
			.replace(/#/g, "")
			.trim();

		const lines = doc.splitTextToSize(clean, pageWidth);

		lines.forEach((line: string) => {
			if (cursorY > pageHeight - 20) addPage();
			doc.text(line, marginX, cursorY);
			cursorY += 6;
		});

		cursorY += 6;
	};

	// =============================
	// 🏁 COVER PAGE
	// =============================
	doc.setFillColor(245, 245, 245);
	doc.rect(0, 0, 210, 297, "F");

	// 🔥 BIG LOGO
	const coverLogo = getLogoSize(100);

	doc.addImage(
		logo,
		"PNG",
		(210 - coverLogo.width) / 2, // center horizontally
		40,
		coverLogo.width,
		coverLogo.height
	);

	doc.setFont("Helvetica", "bold");
	doc.setFontSize(24);
	doc.text(title, 105, 100, { align: "center" });

	doc.setFontSize(12);
	doc.setFont("Helvetica", "normal");
	doc.text(
		`Generated on ${new Date().toLocaleString()}`,
		105,
		115,
		{ align: "center" }
	);

	doc.setFontSize(11);
	doc.text(
		"AI Multi-Agent Intelligence Report",
		105,
		130,
		{ align: "center" }
	);

	// Footer
	doc.setFontSize(10);
	doc.text("Confidential Report", 105, 280, { align: "center" });

	// =============================
	// 📄 CONTENT PAGES
	// =============================
	addPage();

	addSection("Metrics Dashboard", "");

	// 📊 SCORE
	const score = extractScore(data.critic ?? "");

	// Big score display
	doc.setFont("Helvetica", "bold");
	doc.setFontSize(28);
	doc.text(`${score}%`, marginX, cursorY);

	doc.setFontSize(12);
	doc.setFont("Helvetica", "normal");
	doc.text("Overall AI Confidence Score", marginX + 30, cursorY);

	cursorY += 10;

	// Bar
	drawBar("Confidence", score);

	// 📊 Derived metrics
	const plannerSize = data.planner?.length || 0;
	const researchCount = data.researchers?.length || 0;
	const writerSize = data.writer?.length || 0;

	// Normalize (simple heuristic)
	drawBar("Planning Depth", Math.min(plannerSize / 20, 100));
	drawBar("Research Coverage", Math.min(researchCount * 15, 100));
	drawBar("Output Detail", Math.min(writerSize / 50, 100));

	addSubtleDivider();

	addSection("1. Planning", data.planner);

	if (Array.isArray(data.researchers)) {
		data.researchers.forEach((r: string, i: number) => {
			addSection(`2.${i + 1} Research Insight`, r);
		});
	}

	addSection("3. Synthesized Intelligence", data.synthesizer);
	addSection("4. Draft Output", data.writer);
	addSection("5. Final Answer", data.critic);

	// =============================
	// 📄 FOOTER (page numbers)
	// =============================
	const pageCount = doc.getNumberOfPages();

	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);

		doc.setFontSize(9);
		doc.text(`Page ${i} of ${pageCount}`, 190, 290, {
			align: "right",
		});
	}

	doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
}
