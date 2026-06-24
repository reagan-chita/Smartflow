package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"time"
)

// GenerateSecret generates a random 16-character Base32 secret (10 bytes of entropy)
func GenerateSecret() (string, error) {
	bytes := make([]byte, 10)
	_, err := rand.Read(bytes)
	if err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes), nil
}

// VerifyTOTP verifies if the given 6-digit passcode matches the secret key,
// allowing for a clock drift window of +/- 30 seconds (1 step before/after).
func VerifyTOTP(secret string, code string) bool {
	// Decode secret
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		// Try decoding with standard padding if the secret has padding
		key, err = base32.StdEncoding.DecodeString(secret)
		if err != nil {
			return false
		}
	}

	// Current counter interval (30-second time steps)
	currentTime := time.Now()
	counter := uint64(currentTime.Unix() / 30)

	// Check counter, counter-1, and counter+1 (drift window)
	for i := -1; i <= 1; i++ {
		c := counter + uint64(i)
		
		// Convert counter to an 8-byte big-endian byte array
		buf := make([]byte, 8)
		binary.BigEndian.PutUint64(buf, c)

		// Compute HMAC-SHA1
		mac := hmac.New(sha1.New, key)
		mac.Write(buf)
		sum := mac.Sum(nil)

		// Dynamic truncation to get 32-bit integer
		offset := sum[len(sum)-1] & 0xf
		value := int32(((int(sum[offset]) & 0x7f) << 24) |
			((int(sum[offset+1]) & 0xff) << 16) |
			((int(sum[offset+2]) & 0xff) << 8) |
			(int(sum[offset+3]) & 0xff))

		// Get 6-digit PIN
		otp := value % 1000000
		expected := fmt.Sprintf("%06d", otp)

		if expected == code {
			return true
		}
	}

	return false
}

// GenerateTOTPCode generates the current 6-digit TOTP code for the given secret.
func GenerateTOTPCode(secret string) (string, error) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		key, err = base32.StdEncoding.DecodeString(secret)
		if err != nil {
			return "", err
		}
	}

	currentTime := time.Now()
	counter := uint64(currentTime.Unix() / 30)

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

