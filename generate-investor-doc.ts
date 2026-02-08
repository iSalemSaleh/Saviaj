import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
  info: {
    Title: 'AtlasRide - Investor Overview',
    Author: 'AtlasRide',
    Subject: 'Investment Opportunity',
  },
});

const output = fs.createWriteStream(path.join(process.cwd(), 'public', 'AtlasRide_Investor_Overview.pdf'));
doc.pipe(output);

const brandColor = '#0077B6';
const darkText = '#1A1A2E';
const bodyText = '#333333';
const accentColor = '#00B4D8';
const lightBg = '#F0F7FA';

function drawHeader() {
  doc.rect(0, 0, doc.page.width, 140).fill(brandColor);
  doc.fontSize(36).font('Helvetica-Bold').fillColor('#FFFFFF')
    .text('AtlasRide', 60, 45, { align: 'left' });
  doc.fontSize(14).font('Helvetica').fillColor('#E0F0FF')
    .text('The Future of Fair Transportation', 60, 90, { align: 'left' });
  doc.moveDown(4);
}

function sectionTitle(title: string) {
  doc.moveDown(0.8);
  doc.rect(60, doc.y, 4, 22).fill(brandColor);
  doc.fontSize(18).font('Helvetica-Bold').fillColor(brandColor)
    .text(title, 72, doc.y + 2);
  doc.moveDown(0.5);
}

function subTitle(title: string) {
  doc.moveDown(0.3);
  doc.fontSize(13).font('Helvetica-Bold').fillColor(darkText)
    .text(title);
  doc.moveDown(0.2);
}

function bodyParagraph(text: string) {
  doc.fontSize(11).font('Helvetica').fillColor(bodyText)
    .text(text, { align: 'justify', lineGap: 4 });
  doc.moveDown(0.4);
}

function bulletPoint(text: string) {
  const x = doc.x;
  doc.fontSize(11).font('Helvetica').fillColor(accentColor)
    .text('●', x, doc.y, { continued: true });
  doc.fillColor(bodyText).font('Helvetica')
    .text(`  ${text}`, { lineGap: 3 });
  doc.moveDown(0.15);
}

function checkPageBreak(needed: number = 120) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - needed) {
    doc.addPage();
  }
}

function drawFooter(pageNum: number) {
  doc.fontSize(8).font('Helvetica').fillColor('#999999')
    .text(`AtlasRide — Confidential Investor Overview  |  Page ${pageNum}`, 60, doc.page.height - 40, { align: 'center', width: doc.page.width - 120 });
}

// ==================== PAGE 1 ====================
drawHeader();
let pageNumber = 1;

doc.fontSize(12).font('Helvetica-Oblique').fillColor(darkText)
  .text('A Democratised Transportation Marketplace That Puts People in the Driver\'s Seat', 60, doc.y, { align: 'center', width: doc.page.width - 120 });
doc.moveDown(1.5);

// The Problem
sectionTitle('The Problem');
bodyParagraph(
  'Traditional ride-hailing apps like Uber and Lyft operate on a take-it-or-leave-it pricing model. A faceless algorithm decides what riders pay and what drivers earn. Riders have no say in pricing, and drivers have no power to negotiate their worth. The result? Riders overpay during surge pricing, and drivers are left with thin margins after platform fees — often earning below minimum wage.'
);
bodyParagraph(
  'This one-sided model has created growing frustration on both sides of the marketplace. Riders want transparency and fairness. Drivers want autonomy and respect. The industry is ripe for disruption.'
);

// The Solution
checkPageBreak();
sectionTitle('The AtlasRide Solution');
bodyParagraph(
  'AtlasRide flips the traditional model on its head. We have built a two-way marketplace where riders and drivers negotiate directly — creating a fairer, more transparent experience for everyone.'
);
bodyParagraph(
  'Think of it like this: instead of an app telling you the price, you set the price. Riders post trip requests with their own price offer. Drivers can accept, counter-offer, or post their own routes for riders to join. It is ride-hailing meets open negotiation — and it works.'
);

// How It Works
checkPageBreak();
sectionTitle('How It Works');

subTitle('For Riders');
bulletPoint('Post a trip request with your starting point, destination, and the price you are willing to pay');
bulletPoint('Browse available drivers and their routes — choose the one that fits your schedule and budget');
bulletPoint('Receive bids from drivers and pick the best offer');
bulletPoint('Find nearby commercial drivers ready for immediate pickup');

doc.moveDown(0.3);
subTitle('For Drivers');
bulletPoint('Accept rider requests that match your route and price expectations');
bulletPoint('Post your planned routes with available seats — let riders come to you');
bulletPoint('Set your own rate per mile and build your reputation through ratings');
bulletPoint('Choose from service categories like Standard, Premium, Eco, Business, and more');

drawFooter(pageNumber);

// ==================== PAGE 2 ====================
doc.addPage();
pageNumber++;

sectionTitle('What Makes AtlasRide Different');

subTitle('1. User-Controlled Pricing');
bodyParagraph(
  'No algorithms deciding what you pay. Riders set their own prices, and drivers decide if the offer is worth their time. This creates genuine market-driven pricing that is fair for both parties.'
);

checkPageBreak();
subTitle('2. Two-Way Marketplace');
bodyParagraph(
  'Unlike traditional apps where only riders request rides, AtlasRide allows drivers to post their routes too. A driver heading from Manchester to London can list available seats, and riders going that way can hop on. This makes every journey more efficient and reduces empty miles on the road.'
);

checkPageBreak();
subTitle('3. Route Sharing & Seat Reservation');
bodyParagraph(
  'Drivers post routes with multiple seats available. Riders can reserve individual seats, making carpooling simple and cost-effective. This is better for passengers, better for drivers, and better for the environment.'
);

checkPageBreak();
subTitle('4. Two Driver Tiers');
bodyParagraph(
  'We welcome both everyday drivers and professional operators. Private drivers can earn extra income with a sensible daily limit (5 rides or £99.99 per day), while Commercial (Pro) drivers operate without limits, set their rate per mile, and access premium features. This creates a diverse, reliable driver pool.'
);

checkPageBreak();
subTitle('5. Recurring Journeys');
bodyParagraph(
  'Many people make the same trip every day — commuters, school runs, regular business travel. AtlasRide lets both riders and drivers set up recurring schedules. The system automatically generates listings for the next 14 days, so your regular ride is always sorted. No need to re-book every morning.'
);

checkPageBreak();
subTitle('6. Real-Time Tracking & In-Ride Chat');
bodyParagraph(
  'Once a ride is confirmed, riders can track their driver in real time on a live map. Built-in chat allows riders and drivers to communicate directly — no need to exchange personal phone numbers. Safety and convenience, together.'
);

checkPageBreak();
subTitle('7. Mutual Ratings & Trust');
bodyParagraph(
  'Both riders and drivers rate each other after every trip. This two-way rating system builds accountability and trust across the platform. High-rated drivers attract more riders, and reliable riders get better service.'
);

drawFooter(pageNumber);

// ==================== PAGE 3 ====================
doc.addPage();
pageNumber++;

sectionTitle('Small Business & Fleet Management');
bodyParagraph(
  'AtlasRide is not just for individuals. We have built a full business module that allows transportation companies, taxi firms, and fleet operators to manage their operations on our platform.'
);
bulletPoint('Register your organisation and manage a fleet of drivers and vehicles');
bulletPoint('Assign vehicles to drivers and track your team\'s activity');
bulletPoint('Upload business documentation for verification and compliance');
bulletPoint('Role-based access control — owners, admins, and drivers each see what they need');
bodyParagraph(
  'This opens AtlasRide to the B2B market, allowing established transportation businesses to modernise their operations while accessing our growing rider base.'
);

checkPageBreak(200);
sectionTitle('Security & Payments');
bodyParagraph(
  'We take security seriously. AtlasRide is built with enterprise-grade protections:'
);
bulletPoint('Secure payment processing through Stripe with automatic refund handling');
bulletPoint('All sensitive data is encrypted and never exposed — bank details, personal documents, and passwords are fully protected');
bulletPoint('Driver identity verification with secure document upload and review');
bulletPoint('Phone and email verification during signup to prevent fraudulent accounts');
bulletPoint('Real-time fraud prevention with rate limiting and payment validation');
bodyParagraph(
  'Riders pay securely through the app, and driver earnings are tracked and protected. The platform handles cancellation refunds automatically, creating a hassle-free experience.'
);

checkPageBreak(200);
sectionTitle('Mobile-First Design');
bodyParagraph(
  'AtlasRide is designed for mobile from the ground up. The app features a modern, clean interface with intuitive navigation. We are building for Android and iOS using native app technology, ensuring a smooth, responsive experience that feels like it belongs on your phone — not a website crammed into a small screen.'
);
bodyParagraph(
  'The design uses a distinctive peacock blue theme with elegant glass-effect styling that sets AtlasRide apart visually from the competition.'
);

checkPageBreak(200);
sectionTitle('Revenue Model');
bodyParagraph(
  'AtlasRide generates revenue through multiple streams:'
);
bulletPoint('Service fee on each completed ride (percentage of the agreed price)');
bulletPoint('Pro driver subscriptions for commercial operators wanting unlimited rides and premium features');
bulletPoint('Business/fleet management subscriptions for organisations');
bulletPoint('Featured listings — drivers can pay to boost their route visibility');
bodyParagraph(
  'The platform\'s two-sided marketplace creates strong network effects: more riders attract more drivers, and more drivers attract more riders. As the network grows, so does the value for every participant.'
);

drawFooter(pageNumber);

// ==================== PAGE 4 ====================
doc.addPage();
pageNumber++;

sectionTitle('Market Opportunity');
bodyParagraph(
  'The global ride-hailing market is valued at over $100 billion and continues to grow rapidly. However, dissatisfaction with existing platforms is at an all-time high. Drivers are leaving Uber and Lyft in record numbers due to poor pay and lack of autonomy. Riders are frustrated with unpredictable surge pricing and declining service quality.'
);
bodyParagraph(
  'AtlasRide addresses these pain points directly. By giving control back to users, we create a more sustainable marketplace where both sides benefit. Our route-sharing model also taps into the growing demand for affordable, eco-friendly transportation — a trend that shows no signs of slowing.'
);
bodyParagraph(
  'We are starting in the UK market, with a clear roadmap to expand across Europe and beyond. The platform\'s infrastructure is built to scale to millions of users.'
);

checkPageBreak(200);
sectionTitle('Competitive Advantages');
bulletPoint('First-mover advantage in the democratised ride-hailing space');
bulletPoint('Lower driver churn — drivers who control their pricing stay longer');
bulletPoint('Higher rider satisfaction — transparent pricing builds loyalty');
bulletPoint('Route sharing reduces operational costs and environmental impact');
bulletPoint('B2B fleet management opens a second major revenue channel');
bulletPoint('Recurring journeys create predictable, repeat usage patterns');
bulletPoint('Built on modern, scalable technology ready for rapid growth');

checkPageBreak(200);
sectionTitle('The Vision');
bodyParagraph(
  'AtlasRide is more than a ride-hailing app. It is a movement towards fairer transportation. We believe that the people who use a platform should have a voice in how it works. Riders should not be at the mercy of surge pricing algorithms. Drivers should not be treated as disposable contractors.'
);
bodyParagraph(
  'Our vision is a world where every journey is negotiated fairly, where drivers earn what they deserve, and where riders always know they are getting a good deal. We are building the transportation marketplace that both sides have been waiting for.'
);

doc.moveDown(1.5);
doc.rect(60, doc.y, doc.page.width - 120, 80).fill(lightBg);
doc.fontSize(14).font('Helvetica-Bold').fillColor(brandColor)
  .text('Ready to Join the Ride?', 80, doc.y + 15, { width: doc.page.width - 160, align: 'center' });
doc.fontSize(11).font('Helvetica').fillColor(bodyText)
  .text('We are looking for forward-thinking investors who share our vision for fairer transportation. Get in touch to learn more about this opportunity.', 80, doc.y + 5, { width: doc.page.width - 160, align: 'center', lineGap: 3 });

drawFooter(pageNumber);

doc.end();

output.on('finish', () => {
  console.log('PDF generated successfully: public/AtlasRide_Investor_Overview.pdf');
});
