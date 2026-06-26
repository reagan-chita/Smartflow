package worker

import (
	"log"
)

type EmailJob struct {
	To      string
	Subject string
	Body    string
}

var EmailQueue = make(chan EmailJob, 100)

func StartEmailWorker() {
	log.Println("Starting background email worker...")
	for job := range EmailQueue {
		// Mock email sending
		log.Printf("[MOCK EMAIL SENT to %s] Subject: %s | Body: %s\n", job.To, job.Subject, job.Body)
	}
}
