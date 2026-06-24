package auth

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"testing"
	"time"
)

func generateTOTPAtTime(secret string, t time.Time) (string, error) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		key, err = base32.StdEncoding.DecodeString(secret)
		if err != nil {
			return "", err
		}
	}
	counter := uint64(t.Unix() / 30)
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	sum := mac.Sum(nil)

	offset := sum[len(sum)-1] & 0xf
	value := int32(((int(sum[offset]) & 0x7f) << 24) |
		((int(sum[offset+1]) & 0xff) << 16) |
		((int(sum[offset+2]) & 0xff) << 8) |
		(int(sum[offset+3]) & 0xff))

	otp := value % 1000000
	return fmt.Sprintf("%06d", otp), nil
}

func TestTOTPGenerationAndVerification(t *testing.T) {
	secret, err := GenerateSecret()
	if err != nil {
		t.Fatalf("GenerateSecret failed: %v", err)
	}

	if len(secret) != 16 {
		t.Errorf("Expected secret of length 16, got %d", len(secret))
	}

	// Generate code for current time
	now := time.Now()
	code, err := generateTOTPAtTime(secret, now)
	if err != nil {
		t.Fatalf("generateTOTPAtTime failed: %v", err)
	}

	if len(code) != 6 {
		t.Errorf("Expected 6-digit code, got %s", code)
	}

	// Verify code
	if !VerifyTOTP(secret, code) {
		t.Errorf("VerifyTOTP failed to verify correct code %s", code)
	}

	// Verify code within drift window (-30s)
	pastCode, err := generateTOTPAtTime(secret, now.Add(-30*time.Second))
	if err == nil {
		if !VerifyTOTP(secret, pastCode) {
			t.Errorf("VerifyTOTP failed to verify code within past drift window")
		}
	}

	// Verify code within drift window (+30s)
	futureCode, err := generateTOTPAtTime(secret, now.Add(30*time.Second))
	if err == nil {
		if !VerifyTOTP(secret, futureCode) {
			t.Errorf("VerifyTOTP failed to verify code within future drift window")
		}
	}

	// Verify invalid code
	if VerifyTOTP(secret, "000000") && code != "000000" {
		t.Errorf("VerifyTOTP verified an invalid code '000000'")
	}
}
