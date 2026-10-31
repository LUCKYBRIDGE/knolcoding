const storyButton = document.querySelector('#knolstory-button');
const storyMessage = document.querySelector('#knolstory-message');
if (storyButton && storyMessage) {
  storyButton.addEventListener('click', () => {
    const opening = storyMessage.hidden;
    storyMessage.hidden = !opening;
    storyButton.setAttribute('aria-expanded', String(opening));
  });
  const closeMessage = () => {
    storyMessage.hidden = true;
    storyButton.setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', event => {
    if (!event.target.closest('.related-services')) closeMessage();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMessage();
  });
}
