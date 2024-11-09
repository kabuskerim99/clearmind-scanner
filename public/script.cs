document.getElementById('analysisForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const submitButton = document.getElementById('submitButton');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Wird verarbeitet...';

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: document.getElementById('email').value,
                situation: document.getElementById('situation').value
            })
        });

        const result = await response.json();
        
        if (result.success) {
            alert('Ihre Analyse wurde erfolgreich erstellt und an Ihre E-Mail-Adresse gesendet.');
            document.getElementById('analysisForm').reset();
        } else {
            alert('Ein Fehler ist aufgetreten: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        console.error('Fehler:', error);
        alert('Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
});