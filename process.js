import Groq from "groq-sdk";
import 'dotenv/config'
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY // You'll set this as an environment variable
});

const syllabusSample = `
CS 101 - Introduction to Programming
Fall 2024

Assignment Schedule:
- Homework 1: Variables and Data Types - Due September 15, 2024
- Quiz 1: Chapters 1-3 - September 22, 2024
- Project 1: Build a Calculator - Due October 1, 2024
- Midterm Exam: October 15, 2024 (Covers weeks 1-7)
- Homework 2: Object-Oriented Programming - Due October 29, 2024
- Final Project: Web Application - Due December 10, 2024
- Final Exam: December 18, 2024 at 2:00 PM
`;

async function parseSyllabus(syllabusText) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a syllabus parser. Extract calendar events from syllabi and return them as a JSON array.

Each event should have:
- eventType: one of "homework", "quiz", "exam", "project"
- title: brief name of the assignment/event
- description: additional details if available (optional, can be empty string)
- dueDate: ISO 8601 format (YYYY-MM-DDTHH:MM:SS), use 23:59:59 for assignments without specific times
- className: the course name/code from the syllabus

Return ONLY valid JSON, no markdown formatting or explanation.`
      },
      {
        role: "user",
        content: `Parse this syllabus:\n\n${syllabusText}`
      }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  });

  return JSON.parse(completion.choices[0].message.content);
}

// Test the parser
async function main() {
  try {
    console.log("Success");
    const events = await parseSyllabus(syllabusSample);
    console.log(JSON.stringify(events, null, 2));
  } catch (error) {
    console.error("Error parsing syllabus:", error);
  }
}

main();