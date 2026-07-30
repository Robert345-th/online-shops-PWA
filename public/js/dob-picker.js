(function () {
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function dobPickerMarkup(ids) {
    const dayId = ids.dayId || "dobDay";
    const monthId = ids.monthId || "dobMonth";
    const yearId = ids.yearId || "dobYear";
    return `
      <div class="dob-row">
        <select class="dob-select dob-day" id="${dayId}" aria-label="Day of birth">
          <option value="">Day</option>
        </select>
        <select class="dob-select dob-month" id="${monthId}" aria-label="Month of birth">
          <option value="">Month</option>
        </select>
        <select class="dob-select dob-year" id="${yearId}" aria-label="Year of birth">
          <option value="">Year</option>
        </select>
      </div>`;
  }

  function populateDobPicker(ids) {
    const dayId = ids.dayId || "dobDay";
    const monthId = ids.monthId || "dobMonth";
    const yearId = ids.yearId || "dobYear";
    const dayEl = document.getElementById(dayId);
    const monthEl = document.getElementById(monthId);
    const yearEl = document.getElementById(yearId);
    if (!dayEl || !monthEl || !yearEl) return;

    const minAge = ids.minAge ?? 18;
    const maxAge = ids.maxAge ?? 100;
    const now = new Date().getFullYear();
    const newestYear = now - minAge;
    const oldestYear = now - maxAge;

    monthEl.innerHTML =
      '<option value="">Month</option>' +
      MONTHS.map((name, index) => `<option value="${index + 1}">${name}</option>`).join("");

    yearEl.innerHTML =
      '<option value="">Year</option>' +
      Array.from({ length: newestYear - oldestYear + 1 }, (_, index) => {
        const year = newestYear - index;
        return `<option value="${year}">${year}</option>`;
      }).join("");

    function refreshDays() {
      const year = parseInt(yearEl.value, 10);
      const month = parseInt(monthEl.value, 10);
      const selectedDay = dayEl.value;
      const maxDay = year && month ? daysInMonth(year, month) : 31;

      dayEl.innerHTML =
        '<option value="">Day</option>' +
        Array.from({ length: maxDay }, (_, index) => {
          const day = index + 1;
          return `<option value="${day}">${day}</option>`;
        }).join("");

      if (selectedDay && parseInt(selectedDay, 10) <= maxDay) {
        dayEl.value = selectedDay;
      }
    }

    refreshDays();
    monthEl.addEventListener("change", refreshDays);
    yearEl.addEventListener("change", refreshDays);
  }

  function getDobPickerValue(ids) {
    const day = document.getElementById(ids.dayId || "dobDay")?.value;
    const month = document.getElementById(ids.monthId || "dobMonth")?.value;
    const year = document.getElementById(ids.yearId || "dobYear")?.value;
    if (!day || !month || !year) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  window.dobPickerMarkup = dobPickerMarkup;
  window.populateDobPicker = populateDobPicker;
  window.getDobPickerValue = getDobPickerValue;
})();
