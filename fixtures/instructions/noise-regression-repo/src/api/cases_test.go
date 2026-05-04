package api

import "testing"

func TestCaseState(t *testing.T) {
	if CaseState() != "open" {
		t.Fatal("unexpected state")
	}
}
