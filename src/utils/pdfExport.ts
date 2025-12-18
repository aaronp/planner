import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function generatePDF(ventureName: string) {
    const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - 2 * margin;

    // Add title page
    pdf.setFontSize(24);
    pdf.text(ventureName, pageWidth / 2, 40, { align: "center" });
    pdf.setFontSize(16);
    pdf.text("Venture Plan Report", pageWidth / 2, 55, { align: "center" });
    pdf.setFontSize(10);
    pdf.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, 65, { align: "center" });

    // Helper function to capture and add a page section
    const addSection = async (selector: string, title: string) => {
        const element = document.querySelector(selector);
        if (!element) {
            console.warn(`Element not found: ${selector}`);
            return;
        }

        const canvas = await html2canvas(element as HTMLElement, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/png");
        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addPage();

        // Add section title
        pdf.setFontSize(14);
        pdf.text(title, margin, margin + 5);

        // Calculate how many pages are needed for this section
        let heightLeft = imgHeight;
        let position = margin + 10;

        // Add the first part of the image
        const firstPageHeight = Math.min(pageHeight - position - margin, heightLeft);
        pdf.addImage(imgData, "PNG", margin, position, imgWidth, firstPageHeight, undefined, "FAST");
        heightLeft -= firstPageHeight;

        // Add remaining parts on new pages if needed
        while (heightLeft > 0) {
            pdf.addPage();
            position = margin;
            const remainingHeight = Math.min(pageHeight - 2 * margin, heightLeft);
            const yOffset = imgHeight - heightLeft;

            pdf.addImage(
                imgData,
                "PNG",
                margin,
                position - yOffset,
                imgWidth,
                imgHeight,
                undefined,
                "FAST"
            );
            heightLeft -= remainingHeight;
        }
    };

    // Capture current page content
    try {
        // Look for common page containers and capture the main content
        const mainContent = document.querySelector("main") || document.querySelector(".grid.gap-4");

        if (mainContent) {
            const canvas = await html2canvas(mainContent as HTMLElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
            });

            const imgData = canvas.toDataURL("image/png");
            const imgWidth = contentWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addPage();
            pdf.setFontSize(14);
            pdf.text("Current View", margin, margin + 5);

            let heightLeft = imgHeight;
            let position = margin + 10;

            const firstPageHeight = Math.min(pageHeight - position - margin, heightLeft);
            pdf.addImage(imgData, "PNG", margin, position, imgWidth, firstPageHeight, undefined, "FAST");
            heightLeft -= firstPageHeight;

            while (heightLeft > 0) {
                pdf.addPage();
                position = margin;
                const yOffset = imgHeight - heightLeft;
                pdf.addImage(imgData, "PNG", margin, position - yOffset, imgWidth, imgHeight, undefined, "FAST");
                heightLeft -= (pageHeight - 2 * margin);
            }
        }
    } catch (error) {
        console.error("Error capturing content:", error);
    }

    // Save the PDF
    const filename = `${ventureName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
    pdf.save(filename);
}
