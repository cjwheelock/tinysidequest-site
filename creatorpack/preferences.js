// Form-associated controls remain part of the authenticated upload, never a separate request.
export function setupCreativePreferences(doc, onChange = () => {}) {
  const root = doc.getElementById('creative-preferences');
  const topics = [...root.querySelectorAll('[name="pack_topic"]')];
  const selected = name => root.querySelector(`[name="${name}"]:checked`)?.value;
  const update = event => {
    if (topics.filter(input => input.checked).length > 3) {
      event.target.checked = false;
      doc.getElementById('topic-status').textContent = 'Choose up to three topics. Uncheck one to pick another.';
    } else {
      const count = topics.filter(input => input.checked).length;
      doc.getElementById('topic-status').textContent = count ? `${count} of 3 selected` : '';
    }
    doc.getElementById('other-topic-field').hidden = !topics.some(input => input.value === 'other' && input.checked);
    doc.getElementById('location-details-field').hidden = selected('location_mode') === 'anywhere';
    onChange();
  };
  root.addEventListener('change', update);
  root.addEventListener('input', onChange);
  return { read() {
    const selectedTopics = topics.filter(input => input.checked).map(input => input.value);
    const mode = selected('location_mode') || 'anywhere';
    return {
      version: 1,
      topics: selectedTopics,
      topic_other: selectedTopics.includes('other') ? doc.getElementById('topic-other').value.trim() : '',
      location_mode: mode,
      location_details: mode !== 'anywhere' ? doc.getElementById('location-details').value.trim() : '',
      writing_tone: selected('writing_tone') || 'playful-cheeky'
    };
  }};
}
